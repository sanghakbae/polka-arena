// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Smoke test: if this traps too, the problem is the toolchain, not PolkaArena.
contract Ping {
    uint256 public stored;

    function ping() external pure returns (uint256) {
        return 42;
    }

    function store(uint256 value) external {
        stored = value;
    }
}
