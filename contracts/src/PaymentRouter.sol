// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {MerchantRegistry} from "./MerchantRegistry.sol";

/// @title PaymentRouter
/// @notice WondrPay settlement switch on Whitechain (the "NPCI" of the system).
///  - Gasless: payers sign EIP-3009 `receiveWithAuthorization`; a relayer submits and pays WBT gas.
///  - Order-bound: merchant backend signs an EIP-712 Order (UPI "Reference ID"); the payer's
///    authorization nonce MUST equal the order digest, so a signature can only ever settle that order.
///  - Front-run safe: `receiveWithAuthorization` requires msg.sender == to (this contract).
///  - Refunds: capped at the amount paid, always to the original payer, gasless for the merchant.
contract PaymentRouter is EIP712, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address merchant;
        uint256 amount;
        bytes32 orderId;
        uint64 deadline;
    }

    /// @dev EIP-3009 signature pieces. `from` is the authorizer.
    struct Auth {
        address from;
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Payment {
        address payer;
        address merchant;
        uint128 amount;
        uint128 refunded;
        uint64 paidAt;
        uint32 refundCount;
    }

    bytes32 public constant ORDER_TYPEHASH =
        keccak256("Order(address merchant,uint256 amount,bytes32 orderId,uint64 deadline)");
    bytes32 public constant REFUND_TAG = keccak256("WHITEPAY_REFUND");
    bytes32 public constant DIRECT_TAG = keccak256("WHITEPAY_DIRECT");

    IERC20 public immutable usdt;
    MerchantRegistry public immutable registry;

    /// @notice paymentId (== order digest) => payment
    mapping(bytes32 paymentId => Payment) public payments;

    /// @notice when true only allow-listed relayers may submit (griefing / drain protection)
    bool public relayerGated;
    mapping(address relayer => bool) public isRelayer;

    event PaymentSettled(
        bytes32 indexed paymentId,
        bytes32 indexed orderId,
        address indexed merchant,
        address payer,
        address payout,
        uint256 amount
    );
    event Refunded(bytes32 indexed paymentId, address indexed payer, uint256 amount, uint256 totalRefunded);
    event DirectPayment(address indexed from, address indexed to, uint256 amount, bytes32 memo);
    event RelayerSet(address indexed relayer, bool allowed);
    event RelayerGated(bool gated);

    error NotRelayer();
    error MerchantInactive();
    error BadMerchantSignature();
    error OrderExpired();
    error OrderAlreadyPaid();
    error ZeroAmount();
    error AmountTooLarge();
    error UnknownPayment();
    error RefundExceedsPaid();
    error NotMerchantPayout();
    error ZeroAddress();

    modifier onlyRelayer() {
        if (relayerGated && !isRelayer[msg.sender]) revert NotRelayer();
        _;
    }

    constructor(address admin, IERC20 usdt_, MerchantRegistry registry_)
        EIP712("WhitePayRouter", "1")
        Ownable(admin)
    {
        if (address(usdt_) == address(0) || address(registry_) == address(0)) revert ZeroAddress();
        usdt = usdt_;
        registry = registry_;
    }

    // ------------------------------------------------------------------ views

    /// @notice EIP-712 digest of an order; also the paymentId and the payer's EIP-3009 nonce.
    function hashOrder(Order calldata o) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, o.merchant, o.amount, o.orderId, o.deadline)));
    }

    /// @notice nonce the merchant payout wallet must sign for its next refund of `paymentId`.
    function refundNonce(bytes32 paymentId) public view returns (bytes32) {
        return keccak256(abi.encode(REFUND_TAG, block.chainid, address(this), paymentId, payments[paymentId].refundCount));
    }

    /// @notice nonce a payer signs for a direct (P2P) push to `to` with `memo`.
    function directNonce(address to, bytes32 memo) public view returns (bytes32) {
        return keccak256(abi.encode(DIRECT_TAG, block.chainid, address(this), to, memo));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------------------------------------------------------------- payments

    /// @notice Settle a merchant order with the payer's gasless EIP-3009 authorization.
    function payOrder(Order calldata o, bytes calldata merchantSig, Auth calldata a)
        external
        nonReentrant
        whenNotPaused
        onlyRelayer
        returns (bytes32 paymentId)
    {
        if (o.amount == 0) revert ZeroAmount();
        if (o.amount > type(uint128).max) revert AmountTooLarge();
        if (block.timestamp > o.deadline) revert OrderExpired();

        MerchantRegistry.Merchant memory m = registry.get(o.merchant);
        if (!m.active) revert MerchantInactive();

        paymentId = hashOrder(o);
        if (payments[paymentId].payer != address(0)) revert OrderAlreadyPaid();
        if (!SignatureChecker.isValidSignatureNow(m.signer, paymentId, merchantSig)) revert BadMerchantSignature();

        payments[paymentId] = Payment({
            payer: a.from,
            merchant: o.merchant,
            amount: uint128(o.amount),
            refunded: 0,
            paidAt: uint64(block.timestamp),
            refundCount: 0
        });

        // nonce == order digest binds the payer signature to this exact order
        IERC3009(address(usdt)).receiveWithAuthorization(
            a.from, address(this), o.amount, a.validAfter, a.validBefore, paymentId, a.v, a.r, a.s
        );
        usdt.safeTransfer(m.payout, o.amount);

        emit PaymentSettled(paymentId, o.orderId, o.merchant, a.from, m.payout, o.amount);
    }

    /// @notice Gasless (partial) refund. The merchant payout wallet signs an EIP-3009 authorization
    /// to this router for `amount` with nonce = refundNonce(paymentId). Funds go to the original payer only.
    function refund(bytes32 paymentId, uint256 amount, Auth calldata a)
        external
        nonReentrant
        whenNotPaused
        onlyRelayer
    {
        Payment storage p = payments[paymentId];
        if (p.payer == address(0)) revert UnknownPayment();
        if (amount == 0) revert ZeroAmount();
        if (uint256(p.refunded) + amount > p.amount) revert RefundExceedsPaid();
        if (a.from != registry.get(p.merchant).payout) revert NotMerchantPayout();

        bytes32 nonce = refundNonce(paymentId);
        p.refunded += uint128(amount);
        p.refundCount += 1;

        IERC3009(address(usdt)).receiveWithAuthorization(
            a.from, address(this), amount, a.validAfter, a.validBefore, nonce, a.v, a.r, a.s
        );
        usdt.safeTransfer(p.payer, amount);

        emit Refunded(paymentId, p.payer, amount, p.refunded);
    }

    /// @notice Non-gasless refund path: the merchant payout wallet pays gas and has approved this router.
    function refundDirect(bytes32 paymentId, uint256 amount) external nonReentrant whenNotPaused {
        Payment storage p = payments[paymentId];
        if (p.payer == address(0)) revert UnknownPayment();
        if (amount == 0) revert ZeroAmount();
        if (uint256(p.refunded) + amount > p.amount) revert RefundExceedsPaid();
        if (msg.sender != registry.get(p.merchant).payout) revert NotMerchantPayout();

        p.refunded += uint128(amount);
        p.refundCount += 1;
        usdt.safeTransferFrom(msg.sender, p.payer, amount);

        emit Refunded(paymentId, p.payer, amount, p.refunded);
    }

    /// @notice Gasless P2P push ("send to ravi.wondrpay.eth"). Nonce binds recipient + memo.
    function payDirect(address to, uint256 amount, bytes32 memo, Auth calldata a)
        external
        nonReentrant
        whenNotPaused
        onlyRelayer
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC3009(address(usdt)).receiveWithAuthorization(
            a.from, address(this), amount, a.validAfter, a.validBefore, directNonce(to, memo), a.v, a.r, a.s
        );
        usdt.safeTransfer(to, amount);
        emit DirectPayment(a.from, to, amount, memo);
    }

    // ----------------------------------------------------------------- admin

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function setRelayerGated(bool gated) external onlyOwner {
        relayerGated = gated;
        emit RelayerGated(gated);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
