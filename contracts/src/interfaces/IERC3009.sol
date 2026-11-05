// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice EIP-3009 subset used by WhitePay. Whitechain Sepolia USDT
/// (0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, TetherTokenV2) implements this.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
