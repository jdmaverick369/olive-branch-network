// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// LOCAL TEST HARNESS ONLY. Never include these actors in a deployment plan.
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IScaleToken { function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); }
interface IScaleNFT { function ownerMint(address,uint256) external; function totalSupply() external view returns(uint256); function approve(address,uint256) external; }
interface IScaleAssembly { function deposit(uint256) external; function withdraw() external; }
interface IScaleStake { function deposit(uint256,uint256) external; }
interface IScaleGov { function castOfferingVote(uint256,bool) external; function castNonprofitVote(uint256,address) external; }

contract AssemblyScaleActor is IERC721Receiver {
    address public controller;
    function initialize(address token,address staking,address nft,address vault,uint256 tokenId,uint256 pid) external {
        require(controller == address(0)); controller = msg.sender;
        require(IScaleToken(token).approve(staking, 1 ether));
        IScaleStake(staking).deposit(pid, 1 ether);
        IScaleNFT(nft).approve(vault, tokenId);
        IScaleAssembly(vault).deposit(tokenId);
    }
    function vote(address gov,uint256 cycle,address charity,bool phase2) external {
        require(msg.sender == controller);
        if (phase2) IScaleGov(gov).castNonprofitVote(cycle,charity);
        else IScaleGov(gov).castOfferingVote(cycle,false);
    }
    function withdraw(address vault) external { require(msg.sender == controller); IScaleAssembly(vault).withdraw(); }
    function onERC721Received(address,address,uint256,bytes calldata) external pure returns(bytes4) { return IERC721Receiver.onERC721Received.selector; }
}

contract AssemblyScaleActors {
    address public immutable owner = msg.sender;
    address public immutable implementation = address(new AssemblyScaleActor());
    address[] public actors;
    modifier onlyOwner() { require(msg.sender == owner); _; }
    function create(uint256 count,address token,address staking,address nft,address vault) external onlyOwner {
        for(uint256 i; i<count; ++i) {
            address actor = Clones.clone(implementation);
            uint256 tokenId = IScaleNFT(nft).totalSupply() + 1;
            IScaleNFT(nft).ownerMint(actor,1);
            require(IScaleToken(token).transfer(actor,1 ether));
            AssemblyScaleActor(actor).initialize(token,staking,nft,vault,tokenId,actors.length % 300);
            actors.push(actor);
        }
    }
    function voteBatch(uint256 start,uint256 end,address gov,uint256 cycle,address charity,bool phase2) external onlyOwner {
        for(uint256 i=start; i<end; ++i) AssemblyScaleActor(actors[i]).vote(gov,cycle,charity,phase2);
    }
    function withdraw(uint256 i,address vault) external onlyOwner { AssemblyScaleActor(actors[i]).withdraw(vault); }
}

