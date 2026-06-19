/**
 * Client-side logger wrapper.
 * In production, no-ops debug/info/log (suppresses verbose output).
 * In development, passes through to console with structured prefix.
 * warn and error always pass through.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  [key: string]: unknown;
}

const isProduction = import.meta.env.PROD;

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const parts: string[] = [`[${level.toUpperCase()}]`];
  if (context?.module) {
    parts.push(`[${context.module}]`);
  }
  parts.push(message);
  if (context) {
    const { module: _m, ...rest } = context;
    if (Object.keys(rest).length > 0) {
      parts.push(JSON.stringify(rest));
    }
  }
  return parts.join(' ');
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (isProduction) return;
    console.debug(formatMessage('debug', message, context));
  },
  info(message: string, context?: LogContext): void {
    if (isProduction) return;
    console.info(formatMessage('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage('warn', message, context));
  },
  error(message: string, context?: LogContext): void {
    console.error(formatMessage('error', message, context));
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
