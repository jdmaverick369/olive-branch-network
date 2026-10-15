// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {OliveAssembly} from "../OliveAssembly.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract GovernanceVaultReceiver is IERC721Receiver {
    OliveAssembly public vault;
    bool public reject;
    bool public reentrySucceeded;
    function register(OliveAssembly vault_, uint256 tokenId) external {
        vault = vault_;
        vault.oliveNFT().approve(address(vault), tokenId);
        vault.deposit(tokenId);
    }
    function setReject(bool value) external { reject = value; }
    function withdraw() external { vault.withdraw(); }
    function withdrawTo(address recipient) external { vault.withdrawTo(recipient); }
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        require(!reject, "receiver rejected");
        if (address(vault) != address(0)) {
            try vault.withdraw() { reentrySucceeded = true; } catch {}
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
