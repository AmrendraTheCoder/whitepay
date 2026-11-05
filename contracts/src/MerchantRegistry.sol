// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MerchantRegistry
/// @notice UPI-style merchant onboarding: the WhitePay operator (acting like an acquiring PSP)
/// registers merchants after checks, and marks large/trusted ones as "verified"
/// (the "address verified" badge). Only verified merchants may raise collect requests (off-chain rule).
contract MerchantRegistry is Ownable {
    struct Merchant {
        address payout; // where settled USDT goes; also the refund source
        address signer; // backend key that signs orders (UPI "Reference ID")
        bytes32 ensNode; // namehash of the merchant's ENS name, e.g. chai-shop.whitepay.eth
        bool active;
        bool verified;
    }

    mapping(address merchant => Merchant) private _merchants;

    event MerchantRegistered(address indexed merchant, address payout, address signer, bytes32 ensNode);
    event MerchantUpdated(address indexed merchant, address payout, address signer);
    event MerchantStatus(address indexed merchant, bool active, bool verified);

    error ZeroAddress();
    error AlreadyRegistered();
    error UnknownMerchant();

    constructor(address admin) Ownable(admin) {}

    function register(address merchant, address payout, address signer, bytes32 ensNode) external onlyOwner {
        if (merchant == address(0) || payout == address(0) || signer == address(0)) revert ZeroAddress();
        if (_merchants[merchant].payout != address(0)) revert AlreadyRegistered();
        _merchants[merchant] = Merchant(payout, signer, ensNode, true, false);
        emit MerchantRegistered(merchant, payout, signer, ensNode);
    }

    function update(address merchant, address payout, address signer) external onlyOwner {
        if (payout == address(0) || signer == address(0)) revert ZeroAddress();
        Merchant storage m = _merchants[merchant];
        if (m.payout == address(0)) revert UnknownMerchant();
        m.payout = payout;
        m.signer = signer;
        emit MerchantUpdated(merchant, payout, signer);
    }

    function setStatus(address merchant, bool active, bool verified) external onlyOwner {
        Merchant storage m = _merchants[merchant];
        if (m.payout == address(0)) revert UnknownMerchant();
        m.active = active;
        m.verified = verified;
        emit MerchantStatus(merchant, active, verified);
    }

    function get(address merchant) external view returns (Merchant memory) {
        return _merchants[merchant];
    }

    function isActive(address merchant) external view returns (bool) {
        return _merchants[merchant].active;
    }

    function isVerified(address merchant) external view returns (bool) {
        Merchant storage m = _merchants[merchant];
        return m.active && m.verified;
    }
}
