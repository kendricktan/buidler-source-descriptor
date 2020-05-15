pragma solidity ^0.5.0;

import "./Parent.sol";


contract Child is Parent {
    function _fWithRequire() internal {
        require(true, "False is true");
    }

    function _fWithRequireArgs(uint i) internal {
        require(i > 0 && i <= 5, "i not in range");
    }

    function myFunction() external onlyOwner {
        _fWithRequire();
        _fWithRequireArgs(10);
        require(0 < 1, "0 is greater than 1");

        uint256 i = 1 + 2;
        uint256 i2 = i + 3;
        uint256 i3 = i2 + 5;

        i3 = 54;

        emit OwnerNominated(msg.sender);
    }
}
