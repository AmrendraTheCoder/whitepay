// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {MockUSDT3009} from "./mocks/MockUSDT3009.sol";

contract PaymentRouterTest is Test {
    MockUSDT3009 usdt;
    MerchantRegistry registry;
    PaymentRouter router;

    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");
    address merchant = makeAddr("merchant");
    uint256 payerPk = 0xA11CE;
    address payer;
    uint256 signerPk = 0xB0B;
    address signer;
    uint256 payoutPk = 0xC0FFEE;
    address payout;

    uint256 constant AMOUNT = 25e6; // 25 USDT

    function setUp() public {
        vm.warp(1_800_000_000);
        payer = vm.addr(payerPk);
        signer = vm.addr(signerPk);
        payout = vm.addr(payoutPk);

        usdt = new MockUSDT3009();
        registry = new MerchantRegistry(admin);
        router = new PaymentRouter(admin, IERC20(address(usdt)), registry);

        vm.prank(admin);
        registry.register(merchant, payout, signer, bytes32("chai-shop"));
        usdt.mint(payer, 1_000e6);
    }

    // ---------------------------------------------------------------- helpers

    function _order(bytes32 id) internal view returns (PaymentRouter.Order memory) {
        return PaymentRouter.Order(merchant, AMOUNT, id, uint64(block.timestamp + 15 minutes));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _auth(uint256 pk, uint256 value, bytes32 nonce) internal view returns (PaymentRouter.Auth memory a) {
        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                usdt.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                vm.addr(pk),
                address(router),
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        a = PaymentRouter.Auth(vm.addr(pk), validAfter, validBefore, v, r, s);
    }

    function _pay(bytes32 id) internal returns (bytes32 paymentId) {
        PaymentRouter.Order memory o = _order(id);
        bytes32 digest = router.hashOrder(o);
        paymentId = router.payOrder(o, _sign(signerPk, digest), _auth(payerPk, AMOUNT, digest));
    }

    // ------------------------------------------------------------------ tests

    function test_payOrder_happyPath() public {
        bytes32 paymentId = _pay("order-1");
        assertEq(usdt.balanceOf(payout), AMOUNT);
        assertEq(usdt.balanceOf(payer), 1_000e6 - AMOUNT);
        assertEq(usdt.balanceOf(address(router)), 0);
        (address p, address m, uint128 amt,,,) = router.payments(paymentId);
        assertEq(p, payer);
        assertEq(m, merchant);
        assertEq(amt, AMOUNT);
    }

    function test_payOrder_replayReverts() public {
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory msig = _sign(signerPk, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        router.payOrder(o, msig, a);
        vm.expectRevert(PaymentRouter.OrderAlreadyPaid.selector);
        router.payOrder(o, msig, a);
    }

    function test_payOrder_expiredReverts() public {
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory msig = _sign(signerPk, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        vm.warp(block.timestamp + 16 minutes);
        vm.expectRevert(PaymentRouter.OrderExpired.selector);
        router.payOrder(o, msig, a);
    }

    function test_payOrder_wrongMerchantSignerReverts() public {
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory badSig = _sign(0xBAD, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        vm.expectRevert(PaymentRouter.BadMerchantSignature.selector);
        router.payOrder(o, badSig, a);
    }

    function test_payOrder_tamperedAmountReverts() public {
        // payer signed for AMOUNT, attacker raises the order amount -> digest/nonce mismatch
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        o.amount = AMOUNT * 10;
        bytes32 digest2 = router.hashOrder(o);
        vm.expectRevert(bytes("invalid signature"));
        router.payOrder(o, _sign(signerPk, digest2), a);
    }

    function test_payOrder_inactiveMerchantReverts() public {
        vm.prank(admin);
        registry.setStatus(merchant, false, false);
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory msig = _sign(signerPk, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        vm.expectRevert(PaymentRouter.MerchantInactive.selector);
        router.payOrder(o, msig, a);
    }

    function test_authCannotBeFrontRunDirectlyOnToken() public {
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(bytes("caller must be the payee"));
        usdt.receiveWithAuthorization(payer, address(router), AMOUNT, a.validAfter, a.validBefore, digest, a.v, a.r, a.s);
    }

    function test_relayerGating() public {
        vm.startPrank(admin);
        router.setRelayerGated(true);
        router.setRelayer(relayer, true);
        vm.stopPrank();

        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory msig = _sign(signerPk, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);

        vm.prank(makeAddr("rando"));
        vm.expectRevert(PaymentRouter.NotRelayer.selector);
        router.payOrder(o, msig, a);

        vm.prank(relayer);
        router.payOrder(o, msig, a);
        assertEq(usdt.balanceOf(payout), AMOUNT);
    }

    function test_partialRefunds_gasless() public {
        bytes32 paymentId = _pay("order-1");

        router.refund(paymentId, 10e6, _auth(payoutPk, 10e6, router.refundNonce(paymentId)));
        router.refund(paymentId, 15e6, _auth(payoutPk, 15e6, router.refundNonce(paymentId)));

        assertEq(usdt.balanceOf(payer), 1_000e6);
        assertEq(usdt.balanceOf(payout), 0);
        (,,, uint128 refunded,, uint32 count) = router.payments(paymentId);
        assertEq(refunded, AMOUNT);
        assertEq(count, 2);
    }

    function test_refund_exceedingPaidReverts() public {
        bytes32 paymentId = _pay("order-1");
        PaymentRouter.Auth memory a = _auth(payoutPk, AMOUNT + 1, router.refundNonce(paymentId));
        vm.expectRevert(PaymentRouter.RefundExceedsPaid.selector);
        router.refund(paymentId, AMOUNT + 1, a);
    }

    function test_refund_onlyFromMerchantPayout() public {
        bytes32 paymentId = _pay("order-1");
        usdt.mint(vm.addr(0xDEAD), 100e6);
        PaymentRouter.Auth memory a = _auth(0xDEAD, 5e6, router.refundNonce(paymentId));
        vm.expectRevert(PaymentRouter.NotMerchantPayout.selector);
        router.refund(paymentId, 5e6, a);
    }

    function test_refund_unknownPaymentReverts() public {
        PaymentRouter.Auth memory a = _auth(payoutPk, 1e6, bytes32(0));
        vm.expectRevert(PaymentRouter.UnknownPayment.selector);
        router.refund(bytes32("nope"), 1e6, a);
    }

    function test_refundDirect() public {
        bytes32 paymentId = _pay("order-1");
        vm.startPrank(payout);
        usdt.approve(address(router), 5e6);
        router.refundDirect(paymentId, 5e6);
        vm.stopPrank();
        assertEq(usdt.balanceOf(payer), 1_000e6 - AMOUNT + 5e6);
    }

    function test_payDirect_p2p() public {
        address friend = makeAddr("ravi");
        bytes32 memo = keccak256("chai money");
        router.payDirect(friend, 3e6, memo, _auth(payerPk, 3e6, router.directNonce(friend, memo)));
        assertEq(usdt.balanceOf(friend), 3e6);
    }

    function test_payDirect_cannotRedirect() public {
        address friend = makeAddr("ravi");
        bytes32 memo = keccak256("chai money");
        PaymentRouter.Auth memory a = _auth(payerPk, 3e6, router.directNonce(friend, memo));
        vm.expectRevert(bytes("invalid signature"));
        router.payDirect(makeAddr("attacker"), 3e6, memo, a);
    }

    function test_pause() public {
        vm.prank(admin);
        router.pause();
        PaymentRouter.Order memory o = _order("order-1");
        bytes32 digest = router.hashOrder(o);
        bytes memory msig = _sign(signerPk, digest);
        PaymentRouter.Auth memory a = _auth(payerPk, AMOUNT, digest);
        vm.expectRevert();
        router.payOrder(o, msig, a);
    }

    function testFuzz_refundsNeverExceedPaid(uint96 r1, uint96 r2) public {
        bytes32 paymentId = _pay("order-1");
        r1 = uint96(bound(r1, 1, AMOUNT));
        router.refund(paymentId, r1, _auth(payoutPk, r1, router.refundNonce(paymentId)));
        r2 = uint96(bound(r2, 1, 2 * AMOUNT));
        PaymentRouter.Auth memory a = _auth(payoutPk, r2, router.refundNonce(paymentId));
        if (uint256(r1) + r2 > AMOUNT) {
            vm.expectRevert(PaymentRouter.RefundExceedsPaid.selector);
        }
        router.refund(paymentId, r2, a);
    }
}
