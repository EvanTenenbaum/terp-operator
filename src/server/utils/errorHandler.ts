import { TRPCError } from '@trpc/server';

/**
 * Standardized error handling for tRPC procedures
 *
 * Ensures consistent error responses and proper error logging
 */

export function handleProcedureError(error: unknown, operation: string): never {
  // If it's already a TRPCError, re-throw it
  if (error instanceof TRPCError) {
    throw error;
  }

  // Log the original error for debugging
  console.error(`Error in ${operation}:`, error);

  // Determine if this is a database error
  const isDatabaseError = error instanceof Error && (
    error.message.includes('database') ||
    error.message.includes('postgres') ||
    error.message.includes('SQL')
  );

  // Throw appropriate TRPCError
  throw new TRPCError({
    code: isDatabaseError ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
    message: `An error occurred while ${operation}`,
    cause: error,
  });
}

/**
 * Validate and sanitize user input
 */
export function validateInput<T>(
  input: unknown,
  operation: string,
  validator: (input: unknown) => input is T
): T {
  if (!validator(input)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid input for ${operation}`,
    });
  }
  return input;
}
