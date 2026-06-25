/**
 * Inventory command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './setInventoryStatus';
import './transferInventoryLocation';
import './transferInventoryOwnership';
