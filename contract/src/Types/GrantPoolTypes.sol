// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
