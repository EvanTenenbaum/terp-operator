/**
 * Contacts domain — command payload schemas.
 *
 * Re-export barrel from @/shared/schemas so commandDefs can import from
 * `../schemas` following the purchase-orders domain pattern.
 */
export {
  addContactRolePayloadSchema,
  archiveContactPayloadSchema,
  cancelAppointmentPayloadSchema,
  completeAppointmentPayloadSchema,
  createAppointmentPayloadSchema,
  createContactPayloadSchema,
  linkContactToExistingEntityPayloadSchema,
  linkContactToUserPayloadSchema,
  updateAppointmentPayloadSchema,
  updateContactPayloadSchema,
} from '@/shared/schemas';
