/**
 * System/Recovery/Closeout command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './applyTags';
import './acknowledgeWarehouseAlert';
import './cancelFulfillmentLine';
import './markOrderFulfilled';
import './approveConnectorRequest';
import './rejectConnectorRequest';
import './routeConnectorRequest';
import './createCorrectionJournalEntry';
import './postTransactionLedgerRow';
import './upsertTransactionType';
import './reverseCommandById';
import './documentCommandFailure';
import './restoreFromBackupPoint';
import './postPeriodAdjustments';
import './lockPeriod';
import './archivePeriod';
import './createCustomerNeed';
import './updateCustomerNeed';
import './setItemAlias';
import './createReferee';
import './updateReferee';
import './addRefereeRelationship';
import './updateRefereeRelationship';
import './deactivateRefereeRelationship';
import './voidRefereeCredit';
import './createPaymentProcessor';
import './updateProcessorFeeStatus';
import './updateSystemSetting';
import './createItem';
import './updateItem';
import './toggleItemStatus';
import './resolveInvoiceDispute';
import './rejectInvoiceDispute';
import './approveMergeCandidate';
import './dismissMergeCandidate';
