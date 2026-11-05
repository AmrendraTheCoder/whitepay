// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Terms of one subscription. They are the clone's immutable args, so the clone's ADDRESS
///         commits to every field: one EIP-2612 permit to that address = consent to exactly these terms.
struct Terms {
    address subscriber;
    address merchant;
    uint128 amount; // per cycle, token base units
    uint64 period; // seconds between cycles
    uint64 startAt; // due time of cycle 0
    uint64 grace; // a cycle can be charged until due + grace, never later
    uint16 cycles;
    bytes32 subscriptionId; // random, makes the address unique
}

/// @title WhitePay Autopay mandate (one minimal clone per subscription)
/// @notice Pulls `amount` from the subscriber to the merchant once per cycle, only inside that cycle's
///         window [due - EARLY, due + grace], never more than `cycles` times (the permit also caps the
///         allowance at amount * cycles). Missed windows are skipped, never charged late. Anyone may
///         trigger a due charge (money can only go to the merchant, on schedule). The subscriber or the
///         merchant can cancel; the subscriber can also cancel gaslessly with a signature.
contract AutopayMandate {
    using SafeERC20 for IERC20;

    uint64 public constant EARLY = 30;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CANCEL_TYPEHASH = keccak256("CancelAutopay(address mandate,bytes32 subscriptionId)");

    IERC20 public immutable token;
    address public immutable factory;

    uint16 public nextCycle; // lowest cycle index that may still be charged
    uint16 public chargedCount;
    bool public cancelled;

    event Charged(uint16 indexed cycle, uint256 amount, uint16 chargedCount);
    event Cancelled(address indexed by);

    error Cancelled_();
    error Finished();
    error NotDue();
    error NotAuthorized();

    constructor(IERC20 token_, address factory_) {
        token = token_;
        factory = factory_;
    }

    function terms() public view returns (Terms memory) {
        return abi.decode(Clones.fetchCloneArgs(address(this)), (Terms));
    }

    /// @notice Index and due time of the cycle charge() would take now (skipping windows that closed).
    function pending() public view returns (uint16 cycle, uint64 dueAt, bool chargeable) {
        Terms memory t = terms();
        uint16 i = nextCycle;
        while (i < t.cycles && block.timestamp > uint256(t.startAt) + uint256(i) * t.period + t.grace) i++;
        if (i >= t.cycles || cancelled) return (i, 0, false);
        dueAt = uint64(uint256(t.startAt) + uint256(i) * t.period);
        return (i, dueAt, block.timestamp + EARLY >= dueAt);
    }

    function charge() external returns (uint16 cycle) {
        if (cancelled) revert Cancelled_();
        Terms memory t = terms();
        (uint16 i, uint64 dueAt, bool ok) = pending();
        if (i >= t.cycles) revert Finished();
        if (!ok || dueAt == 0) revert NotDue();
        nextCycle = i + 1;
        chargedCount += 1;
        token.safeTransferFrom(t.subscriber, t.merchant, t.amount);
        emit Charged(i, t.amount, chargedCount);
        return i;
    }

    function cancelDigest() public view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("WhitePayAutopay"), keccak256("1"), block.chainid, address(this))
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(CANCEL_TYPEHASH, address(this), terms().subscriptionId))));
    }

    /// @param sig subscriber's EIP-712 CancelAutopay signature; empty when called by subscriber/merchant directly
    function cancel(bytes calldata sig) external {
        Terms memory t = terms();
        if (msg.sender != t.subscriber && msg.sender != t.merchant) {
            if (ECDSA.recover(cancelDigest(), sig) != t.subscriber) revert NotAuthorized();
        }
        cancelled = true;
        emit Cancelled(msg.sender == t.merchant ? t.merchant : t.subscriber);
    }
}

/// @title WhitePay Autopay factory
/// @notice start(): deploys the mandate clone for `t`, applies the subscriber's single permit
///         (spender = the clone, value = amount * cycles) and charges cycle 0.
contract AutopayFactory {
    address public immutable implementation;
    IERC20 public immutable token;

    event Started(address indexed mandate, address indexed subscriber, address indexed merchant, bytes32 subscriptionId, uint256 amount, uint64 period, uint16 cycles);

    error BadTerms();
    error NoAllowance();

    constructor(IERC20 token_) {
        token = token_;
        implementation = address(new AutopayMandate(token_, address(this)));
    }

    function mandateAddress(Terms calldata t) public view returns (address) {
        return Clones.predictDeterministicAddressWithImmutableArgs(implementation, abi.encode(t), t.subscriptionId);
    }

    function start(Terms calldata t, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (address m) {
        if (t.subscriber == address(0) || t.merchant == address(0) || t.subscriber == t.merchant) revert BadTerms();
        if (t.amount == 0 || t.period == 0 || t.cycles == 0 || t.grace == 0) revert BadTerms();
        m = mandateAddress(t);
        if (m.code.length == 0) Clones.cloneDeterministicWithImmutableArgs(implementation, abi.encode(t), t.subscriptionId);
        uint256 total = uint256(t.amount) * t.cycles;
        // permit can be front-run by anyone holding the signature; that's harmless, so tolerate it
        try IERC20Permit(address(token)).permit(t.subscriber, m, total, deadline, v, r, s) {} catch {}
        if (token.allowance(t.subscriber, m) < t.amount) revert NoAllowance();
        emit Started(m, t.subscriber, t.merchant, t.subscriptionId, t.amount, t.period, t.cycles);
        AutopayMandate(m).charge();
    }
}
