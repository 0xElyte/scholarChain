// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical pool lifecycle states — shared by GrantPool (internal logic) and
///         PoolSummary / Factory (external views). Order MUST stay in sync with
///         GrantPool's internal PoolState enum.
enum PoolStateEnum {
    PENDING,
    ACTIVE,
    REVIEW,
    DISTRIBUTING,
    CLOSED,
    CANCELLED
}

/// @notice Type of input a benefactor must supply for a submission field.
enum FieldType {
    TEXT,     // plain text — frontend renders a textarea
    URL,      // hyperlink — frontend renders a text input with URL validation
    DOCUMENT  // file upload — frontend uploads to IPFS and stores the resulting CID
}

/// @notice One required field in a pool's submission form.
struct FieldDefinition {
    FieldType fieldType;
    string    label;    // e.g. "Project Description", "GitHub URL", "Upload CV"
    bool      required;
}

/// @notice Flat, frontend-friendly snapshot of a GrantPool's state.
///         Returned by GrantPool.getPoolSummary() and Factory.getAllPoolSummaries() /
///         Factory.getProtocolStats(). One eth_call per pool instead of many.
struct PoolSummary {
    address      poolAddress;
    string       poolName;
    PoolStateEnum state;
    address      creator;
    uint256 totalDeposited; // raw USDT (6 decimals)
    uint256 submissionStart;
    uint256 submissionEnd;
    uint256 reviewEnd;
    uint256 signerCount;
    uint256 winnersCount;
    uint256 claimedCount;
    uint256 proposalCount;
    uint256 distributionAmount; // per-winner share; 0 until distribution entered
    bool    distributionEntered;
    bool    isCancelled;
}
