// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INFT {
    function totalSupply() external view returns (uint256);
    function tokenByIndex(uint256) external view returns (uint256);
    function ownerOf(uint256) external view returns (address);
    function ownerMint(address, uint256) external;
}

// Benchmark only: no access control, voting, or production upgrade logic.
contract SnapshotBench {
    mapping(uint256 => mapping(address => bool)) public eligible;
    uint256 public cycle;
    event Snapshot(uint256 indexed cycleId, uint256 supply, uint256 holders);

    function snapshot(address collection, bool enumerable) external {
        INFT nft = INFT(collection);
        uint256 supply = nft.totalSupply();
        uint256 id = ++cycle;
        uint256 holders;
        for (uint256 i; i < supply; ++i) {
            // Sequential path relies on OliveNFT's contiguous IDs and no burn entry point.
            address holder = nft.ownerOf(enumerable ? nft.tokenByIndex(i) : i + 1);
            if (!eligible[id][holder]) {
                eligible[id][holder] = true;
                ++holders;
            }
        }
        emit Snapshot(id, supply, holders);
    }
}

// Builds fixtures through the actual OliveNFT ownerMint entry point, not synthetic ownerOf.
contract MintFixture {
    function mintDistinct(address collection, uint256 first, uint256 count) external {
        for (uint256 i; i < count; ++i) {
            INFT(collection).ownerMint(address(uint160(0x100000 + first + i)), 1);
        }
    }
}
