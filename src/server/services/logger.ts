/**
 * Structured JSON logger for server-side code.
 * Levels: debug, info, warn, error
 * Context: module, requestId, and additional metadata.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

function formatEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  const { module, requestId, ...rest } = context ?? {};
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(module ? { module } : {}),
    ...(requestId ? { requestId } : {}),
    ...(Object.keys(rest).length > 0 ? { context: rest } : {}),
  };
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const entry = formatEntry(level, message, context);
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    write('debug', message, context);
  },
  info(message: string, context?: LogContext): void {
    write('info', message, context);
  },
  warn(message: string, context?: LogContext): void {
    write('warn', message, context);
  },
  error(message: string, context?: LogContext): void {
    write('error', message, context);
  },
  /** Create a child logger with preset context fields */
  child(preset: LogContext) {
    const parent = this;
    return {
      debug(message: string, context?: LogContext): void {
        parent.debug(message, { ...preset, ...context });
      },
      info(message: string, context?: LogContext): void {
        parent.info(message, { ...preset, ...context });
      },
      warn(message: string, context?: LogContext): void {
        parent.warn(message, { ...preset, ...context });
      },
      error(message: string, context?: LogContext): void {
        parent.error(message, { ...preset, ...context });
      },
    };
  },
};

export default logger;
