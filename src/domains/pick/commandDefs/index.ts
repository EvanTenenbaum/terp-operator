/**
 * Pick command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './allocateOrderToFulfillment';
import './recordWeighAndPack';
import './releaseLineForPicking';
import './releaseLinesForPicking';
import './recallLineFromPicking';
import './returnPickedUnits';
import './printLabels';
import './createPickList';
import './adjustFulfillmentLine';
