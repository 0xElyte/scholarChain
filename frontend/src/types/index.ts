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
  totalDeposited: string;
  distributionAmount: string;
  state: PoolState;
  signers: string[];
  winners: string[];
  fieldDefinitions: FieldDefinition[];
  isCancelled: boolean;
  distributionEntered: boolean;
  createdAt: number;
}

export interface Proposal {
  benefactor: string;
  documentCID: string;
  payoutAddress: string;
  submittedAt: number;
  approvalCount: number;
  isWinner: boolean;
  hasClaimed: boolean;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  balance: string;
}

export type UserRole = "creator" | "signer" | "applicant" | "winner" | "donor" | "visitor";
