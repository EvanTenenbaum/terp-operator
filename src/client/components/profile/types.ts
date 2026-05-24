/**
 * Explicit types for the contactProfile tRPC query response.
 * The server returns untyped pg.QueryResult rows, so we define
 * the expected shape here rather than deriving from the inferred return type.
 */

export interface ContactProfileData {
  contact: Record<string, unknown>;
  customer: Record<string, unknown> | null;
  vendor: Record<string, unknown> | null;
  referee: Record<string, unknown> | null;
  processor: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
  upcomingAppointmentCount: number;
}
