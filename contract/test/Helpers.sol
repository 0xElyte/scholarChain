// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FieldType, FieldDefinition} from "../src/Types/GrantPoolTypes.sol";

/// @dev Minimal ERC-20 anyone can mint — stands in for USDT in tests.
contract MockERC20 is IERC20 {
    string  public name     = "Mock USDT";
    string  public symbol   = "USDT";
    uint8   public decimals = 6;

    uint256 public override totalSupply;
    mapping(address => uint256)                     public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply    += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        if (allowance[from][msg.sender] != type(uint256).max)
            allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

/// @dev Minimal SBT stub — records the last mint call, requires no role.
contract MockSBT {
    struct MintCall { address to; address poolAddr; string poolName; uint256 amount; address payoutAddr; }
    MintCall[] public mintCalls;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // mirrors ScholarChainSBT.mint signature
    function mint(
        address to,
        address poolAddr,
        string calldata poolName,
        uint256 amount,
        address payoutAddr
    ) external returns (uint256) {
        mintCalls.push(MintCall(to, poolAddr, poolName, amount, payoutAddr));
        return mintCalls.length - 1;
    }

    function mintCallCount() external view returns (uint256) { return mintCalls.length; }

    // Stub IAccessControl.grantRole so Factory can call it
    function grantRole(bytes32, address) external {}
    function hasRole(bytes32, address) external pure returns (bool) { return true; }
    function supportsInterface(bytes4) external pure returns (bool) { return true; }

    // code.length > 0 because this is a deployed contract
}

/// @dev Standard field definitions reused across test suites.
library Fixtures {
    function twoFields() internal pure returns (FieldDefinition[] memory f) {
        f = new FieldDefinition[](2);
        f[0] = FieldDefinition(FieldType.TEXT,     "Project Description", true);
        f[1] = FieldDefinition(FieldType.DOCUMENT, "Upload CV",           true);
    }
}
