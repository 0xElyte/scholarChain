import type { DecodedError } from "ethers-decode-error";

export const customReasonMapper = ({
  name,
  args,
  reason,
}: DecodedError): string => {
  switch (name) {
    // GrantPool.sol
    case "EmptyPoolName":
      return "Pool name cannot be empty";
    case "InvalidDuration":
      return "The specified duration is invalid";
    case "InvalidStartTime":
      return "The provided start time is invalid";
    case "TooFewSigners":
      return "Not enough signers configured for this pool";
    case "InvalidFeeBps":
      return "The fee basis points value is invalid";
    case "InvalidCID":
      return "The provided content identifier (CID) is invalid";
    case "Unauthorized":
      return "You are not authorized to perform this action";
    case "InvalidState":
      return `Invalid state: expected "${args?.[0] ?? "expected"}", current "${args?.[1] ?? "current"}"`;
    case "AlreadySubmitted":
      return "You have already submitted a proposal to this pool";
    case "AlreadyVoted":
      return "You have already voted on this proposal";
    case "AlreadyWon":
      return "This proposal has already been marked as a winner";
    case "AlreadyClaimed":
      return "The award for this proposal has already been claimed";
    case "InvalidAddress":
      return "The supplied address is invalid";
    case "InvalidAmount":
      return "The supplied amount is invalid";
    case "NotAWinner":
      return "Only winners can claim this reward";
    case "NotADonor":
      return "Only donors can perform this action";
    case "PoolNotCancelled":
      return "The pool has not been cancelled";
    case "SignerListLocked":
      return "The signer list has been locked and cannot be changed";
    case "DistributionAlreadyEntered":
      return "A distribution has already been entered for this pool";
    case "EmptyFieldDefinitions":
      return "Field definitions cannot be empty";
    case "TooManyFields":
      return "Too many fields were provided";
    case "RecoveryTooEarly":
      return "It's too early to recover funds from this pool";
    case "NothingToRecover":
      return "There are no funds available to recover";

    // ScholarChainFactory.sol
    case "Factory__ZeroAddress":
      return "Provided address cannot be the zero address";
    case "Factory__NotAContract":
      return "Provided address is not a contract";
    case "Factory__EmptyPoolName":
      return "Pool name cannot be empty";
    case "Factory__ZeroCID":
      return "CID cannot be zero/empty";
    case "Factory__SubmissionStartInPast":
      return "Submission start time must be in the future";
    case "Factory__SubmissionWindowTooShort":
      return "Submission window is too short";
    case "Factory__ReviewDurationTooShort":
      return "Review duration is too short";
    case "Factory__TooFewSigners":
      return "Factory: too few signers provided";
    case "Factory__TooManySigners":
      return "Factory: too many signers provided";
    case "Factory__DuplicateOrZeroSigner":
      return "Factory: signer list contains duplicate or zero address";
    case "Factory__InvalidFeeBps":
      return "Factory: invalid fee basis points";
    case "Factory__EmptyFieldDefinitions":
      return "Factory: field definitions cannot be empty";
    case "Factory__TooManyFields":
      return "Factory: too many fields provided";

    // ScholarChainSBT.sol
    case "TransferNotAllowed":
      return "Token transfers are not allowed for this SBT";
    case "ZeroAddress":
      return "Zero address is not allowed";
    case "TokenAlreadyMinted":
      return "This token has already been minted";

    // Deploy script errors
    case "Deploy__InvalidRequiredSignatures":
      return "Invalid required number of signatures for deployment";
    case "Deploy__DuplicateSigner":
      return "Duplicate signer provided in deployment config";
    case "Deploy__MainnetRequiresUSDTAddress":
      return "Mainnet deployments require a valid USDT address";

    // TreasuryMultisig types
    case "TreasuryMultisig__InvalidNumberOfRequiredSignatures":
      return "Invalid number of required signatures for multisig";
    case "TreasuryMultisig__InvalidSigner":
      return "Invalid signer provided";
    case "TreasuryMultisig__SignerNotFound":
      return "Signer not found";
    case "TreasuryMultisig__NotSelf":
      return "Operation must be performed by the contract itself";
    case "TreasuryMultisig__InvalidParameters":
      return "Invalid parameters provided";
    case "TreasuryMultisig__NotASigner":
      return "Caller is not a signer";
    case "TreasuryMultisig__ProposalAlreadyExecuted":
      return "This proposal has already been executed";
    case "TreasuryMultisig__AlreadySigned":
      return "This proposal has already been signed by you";
    case "TreasuryMultisig__InvalidProposalId":
      return "Invalid proposal id";
    case "TreasuryMultisig__NotEnoughSignatures":
      return "Not enough signatures to execute this proposal";
    case "TreasuryMultisig__NotASignerOnThisProposal":
      return "You are not a signer on this proposal";
    case "TreasuryMultisig__ProposalExecutionFailed":
      return "Proposal execution failed";
    case "TreasuryMultisig__ProposerCannotSign":
      return "Proposer cannot sign their own proposal";

    default:
      return reason ?? "An error has occurred";
  }
};
