// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {AutopayFactory, AutopayMandate, Terms} from "../src/Autopay.sol";
import {MockUSDTPermit} from "./mocks/MockUSDTPermit.sol";

contract AutopayTest is Test {
    MockUSDTPermit usdt;
    AutopayFactory factory;
    uint256 subPk = 0xA11CE;
    address sub;
    address shop = address(0x5409);
    bytes32 constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdt = new MockUSDTPermit();
        factory = new AutopayFactory(usdt);
        sub = vm.addr(subPk);
        usdt.mint(sub, 100e6);
    }

    function terms() internal view returns (Terms memory t) {
        t = Terms({ subscriber: sub, merchant: shop, amount: 1e6, period: 120, startAt: uint64(block.timestamp), grace: 600, cycles: 3, subscriptionId: keccak256("s1") });
    }

    function permitSig(address spender, uint256 value, uint256 deadline) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, sub, spender, value, usdt.nonces(sub), deadline));
        (v, r, s) = vm.sign(subPk, keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash)));
    }

    function startIt(Terms memory t) internal returns (AutopayMandate m) {
        address predicted = factory.mandateAddress(t);
        (uint8 v, bytes32 r, bytes32 s) = permitSig(predicted, uint256(t.amount) * t.cycles, block.timestamp + 600);
        m = AutopayMandate(factory.start(t, block.timestamp + 600, v, r, s));
        assertEq(address(m), predicted);
    }

    function test_oneSignature_chargesOnSchedule() public {
        Terms memory t = terms();
        AutopayMandate m = startIt(t);
        assertEq(usdt.balanceOf(shop), 1e6, "cycle 0 charged at start");
        vm.expectRevert(AutopayMandate.NotDue.selector);
        m.charge(); // too early
        vm.warp(t.startAt + 120 - 30);
        m.charge();
        assertEq(usdt.balanceOf(shop), 2e6);
        vm.warp(t.startAt + 240);
        m.charge();
        assertEq(usdt.balanceOf(shop), 3e6);
        vm.warp(t.startAt + 360);
        vm.expectRevert(AutopayMandate.Finished.selector);
        m.charge();
        assertEq(usdt.allowance(sub, address(m)), 0, "allowance fully used, never more");
    }

    function test_missedWindowIsSkippedNotChargedLate() public {
        Terms memory t = terms();
        AutopayMandate m = startIt(t);
        vm.warp(t.startAt + 120 + 600 + 1); // cycle 1 window closed (cycle 2 due at +240 still open)
        assertEq(m.charge(), 2, "charges cycle 2, cycle 1 skipped");
        assertEq(usdt.balanceOf(shop), 2e6);
        vm.expectRevert(AutopayMandate.Finished.selector);
        m.charge();
    }

    function test_tamperedTermsHaveNoAllowance() public {
        Terms memory t = terms();
        address real = factory.mandateAddress(t);
        (uint8 v, bytes32 r, bytes32 s) = permitSig(real, 3e6, block.timestamp + 600);
        Terms memory evil = t;
        evil.amount = 50e6; // merchant tries a bigger amount with the same signature
        vm.expectRevert(AutopayFactory.NoAllowance.selector);
        factory.start(evil, block.timestamp + 600, v, r, s);
        evil = t;
        evil.merchant = address(0xBAD); // or a different payee
        vm.expectRevert(AutopayFactory.NoAllowance.selector);
        factory.start(evil, block.timestamp + 600, v, r, s);
    }

    function test_cancelBySignature_stopsCharges() public {
        Terms memory t = terms();
        AutopayMandate m = startIt(t);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(subPk, m.cancelDigest());
        vm.prank(address(0xBEEF)); // relayer submits it
        m.cancel(abi.encodePacked(r, s, v));
        vm.warp(t.startAt + 120);
        vm.expectRevert(AutopayMandate.Cancelled_.selector);
        m.charge();
    }

    function test_strangerCannotCancel() public {
        AutopayMandate m = startIt(terms());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, m.cancelDigest());
        vm.expectRevert(AutopayMandate.NotAuthorized.selector);
        m.cancel(abi.encodePacked(r, s, v));
    }

    function test_merchantCanCancel() public {
        AutopayMandate m = startIt(terms());
        vm.prank(shop);
        m.cancel("");
        assertTrue(m.cancelled());
    }

    function test_frontRunPermitIsHarmless() public {
        Terms memory t = terms();
        address predicted = factory.mandateAddress(t);
        (uint8 v, bytes32 r, bytes32 s) = permitSig(predicted, 3e6, block.timestamp + 600);
        usdt.permit(sub, predicted, 3e6, block.timestamp + 600, v, r, s); // attacker submits permit first
        factory.start(t, block.timestamp + 600, v, r, s); // still starts fine
        assertEq(usdt.balanceOf(shop), 1e6);
    }

    function test_restartCannotDoubleCharge() public {
        Terms memory t = terms();
        startIt(t);
        (uint8 v, bytes32 r, bytes32 s) = permitSig(factory.mandateAddress(t), 3e6, block.timestamp + 600);
        vm.expectRevert(AutopayMandate.NotDue.selector);
        factory.start(t, block.timestamp + 600, v, r, s);
        assertEq(usdt.balanceOf(shop), 1e6);
    }
}
