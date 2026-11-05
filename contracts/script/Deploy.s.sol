// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";

/// Usage (Whitechain Sepolia, chain 1874):
///   source ../.env
///   forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --private-key $DEPLOYER_PK --broadcast
/// Then verify each contract (trailing slash on the verifier URL is required):
///   forge verify-contract <addr> src/PaymentRouter.sol:PaymentRouter --rpc-url whitechain_sepolia \
///     --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ \
///     --constructor-args $(cast abi-encode "c(address,address,address)" <admin> <usdt> <registry>)
contract Deploy is Script {
    address constant USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    function run() external {
        require(block.chainid == 1874, "wrong chain: expected Whitechain Sepolia 1874");
        address admin = msg.sender;

        vm.startBroadcast();
        MerchantRegistry registry = new MerchantRegistry(admin);
        PaymentRouter router = new PaymentRouter(admin, IERC20(USDT), registry);

        // Optional: gate submissions to our relayers (comma-separated in RELAYERS env var)
        address[] memory relayers = vm.envOr("RELAYERS", ",", new address[](0));
        for (uint256 i; i < relayers.length; i++) {
            router.setRelayer(relayers[i], true);
        }
        if (relayers.length > 0) router.setRelayerGated(true);
        vm.stopBroadcast();

        console2.log("MerchantRegistry:", address(registry));
        console2.log("PaymentRouter:   ", address(router));
    }
}
