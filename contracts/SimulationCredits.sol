// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @notice Giao diện dự kiến cho điểm mô phỏng phi chuyển nhượng.
/// @dev Triển khai và quyền duyệt sẽ được bổ sung trong luồng Fuji.
interface SimulationCredits {
    function balanceOf(address account) external view returns (uint256);
}
