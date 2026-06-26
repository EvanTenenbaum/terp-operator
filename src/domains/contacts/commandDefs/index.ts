/**
 * Contacts command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './addContactRole';
import './archiveContact';
import './cancelAppointment';
import './completeAppointment';
import './createAppointment';
import './createContact';
import './linkContactToExistingEntity';
import './linkContactToUser';
import './updateAppointment';
import './updateContact';
