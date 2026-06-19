/**
 * Contacts domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  addContactRole,
  archiveContact,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  createContact,
  linkContactToExistingEntity,
  linkContactToUser,
  updateAppointment,
  updateContact,
} from './commands';
