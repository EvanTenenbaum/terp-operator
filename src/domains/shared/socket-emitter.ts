import type { Server as SocketServer } from 'socket.io';

export interface CommandCompletedEvent {
  commandId: string;
  commandName: string;
  actorId: string;
  status: string;
  comment?: string;
  affectedCount?: number;
  totalAffectedRows?: number;
}

export interface CommandFailedEvent {
  commandId: string;
  commandName: string;
  actorId: string;
  toast: string;
}

/**
 * Emit a command:completed event to all authenticated clients.
 * Called after a successful command execution from the post-commit hook path.
 */
export function emitCommandCompleted(
  io: SocketServer,
  event: CommandCompletedEvent,
): void {
  io.to('authenticated').emit('command:completed', event);
}

/**
 * Emit a command:failed event to all authenticated clients.
 * Called when a command fails, from the error path in runCommand.
 */
export function emitCommandFailed(
  io: SocketServer,
  event: CommandFailedEvent,
): void {
  io.to('authenticated').emit('command:failed', event);
}
