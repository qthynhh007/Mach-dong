// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SimulationCredits (LÚA) — Soulbound Utility Credits on Avalanche Fuji (Chain ID 43113)
/// @notice Non-transferable credits earned from verified agricultural data contributions
///         or purchased with AVAX (1 AVAX = 100 LÚA) for running crop/salinity simulations.
contract SimulationCredits {
    address public owner;
    uint256 public constant CREDITS_PER_AVAX = 100;

    mapping(address => uint256) public balanceOf;
    mapping(bytes32 => bool) public usedSubmissionHashes;

    event CreditsAwarded(
        address indexed farmer,
        uint256 amount,
        bytes32 indexed submissionHash
    );
    event CreditsSpent(
        address indexed farmer,
        uint256 amount,
        string reason
    );
    event CreditsPurchased(
        address indexed beneficiary,
        uint256 avaxPaidWei,
        uint256 creditsMinted
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event WalletFunded(
        address indexed recipient,
        uint256 amountWei
    );

    receive() external payable {}

    modifier onlyOwner() {
        require(msg.sender == owner, "Chi quan tri vien moi co quyen goi ham nay");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Award soulbound simulation credits for an approved CSV/field submission.
    /// @dev Prevents duplicate rewards using `submissionHash`.
    function awardContribution(
        address farmer,
        uint256 amount,
        bytes32 submissionHash
    ) external onlyOwner {
        require(farmer != address(0), "Dia chi vi khong hop le");
        require(amount > 0, "So diem phai lon hon 0");
        require(submissionHash != bytes32(0), "Ma bam du lieu khong hop le");
        require(!usedSubmissionHashes[submissionHash], "Du lieu nay da duoc cap diem truoc do");

        usedSubmissionHashes[submissionHash] = true;
        balanceOf[farmer] += amount;
        emit CreditsAwarded(farmer, amount, submissionHash);
    }

    /// @notice Deduct soulbound credits when running a simulation or assistant query.
    function spendCredits(
        address farmer,
        uint256 amount,
        string calldata reason
    ) external onlyOwner {
        require(farmer != address(0), "Dia chi vi khong hop le");
        require(amount > 0, "So diem su dung phai lon hon 0");
        require(balanceOf[farmer] >= amount, "So du diem LUA khong du");

        balanceOf[farmer] -= amount;
        emit CreditsSpent(farmer, amount, reason);
    }

    /// @notice Buy soulbound LÚA credits with Fuji AVAX (0.01 AVAX = 1 LÚA).
    function buyCredits(address beneficiary) external payable {
        require(beneficiary != address(0), "Dia chi vi nhan khong hop le");
        // 1 AVAX = 1e18 wei -> 100 LUA => 1 LUA = 1e16 wei
        uint256 credits = (msg.value * CREDITS_PER_AVAX) / 1 ether;
        require(credits > 0, "Toi thieu 0.01 AVAX de doi 1 LUA");

        balanceOf[beneficiary] += credits;
        emit CreditsPurchased(beneficiary, msg.value, credits);
    }

    /// @notice Fund a newly created farmer wallet with initial AVAX for gas/demo.
    function fundNewWallet(address payable recipient, uint256 amountWei) external onlyOwner {
        require(recipient != address(0), "Dia chi vi khong hop le");
        require(amountWei > 0, "So AVAX phai lon hon 0");
        require(address(this).balance >= amountWei, "So du AVAX trong hop dong khong du");

        (bool ok, ) = recipient.call{value: amountWei}("");
        require(ok, "Chuyen AVAX that bai");
        emit WalletFunded(recipient, amountWei);
    }

    /// @notice Withdraw accumulated AVAX to contract owner.
    function withdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Dia chi nhan khong hop le");
        (bool ok, ) = recipient.call{value: address(this).balance}("");
        require(ok, "Chuyen AVAX that bai");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Chu so huu moi khong hop le");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
