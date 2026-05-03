export const FieldType = {
  TEXT:     "TEXT",
  URL:      "URL",
  DOCUMENT: "DOCUMENT",
} as const;
export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export interface FieldDefinition {
  fieldType: FieldType;
  label: string;
  required: boolean;
}

export type PoolState =
  | "PENDING"
  | "ACTIVE"
  | "REVIEW"
  | "DISTRIBUTING"
  | "CLOSED"
  | "CANCELLED";

export interface GrantPool {
  address: string;
  poolName: string;
  criteriaMetadataCID: string;
  submissionStart: number;
  submissionEnd: number;
  reviewEnd: number;
  creator: string;
  treasury: string;
  totalDeposited: string;       // raw wei-like string (6-decimal USDT)
  distributionAmount: string;   // raw wei-like string (6-decimal USDT)
  state: PoolState;
  signers: string[];            // full list (populated on detail); partial on cards
  winners: string[];            // full list (populated on detail)
  fieldDefinitions: FieldDefinition[];
  isCancelled: boolean;
  distributionEntered: boolean;
  createdAt: number;
  // Counts from PoolSummary (avoid N fetches on list pages)
  signerCount: number;
  winnersCount: number;
  proposalCount: number;
}

export interface ChainProposal {
  benefactor: string;
  documentCID: string;        // decoded from bytes32
  payoutAddress: string;
  submittedAt: number;
  approvalCount: number;
  isWinner: boolean;
  hasClaimed: boolean;
  hasVotedOnThis: boolean;    // true if connected signer already voted
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  balance: string;
}

export type UserRole = "creator" | "signer" | "applicant" | "winner" | "donor" | "visitor";
