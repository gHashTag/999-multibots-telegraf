/**
 * Centralized logging for VIBEE Editor
 * Provides consistent log formatting and ability to enable/disable by context
 */

export type LogContext = 'STORE' | 'EXPORT' | 'CANVAS' | 'SYNC' | 'MEDIA' | 'RENDER' | 'TIMELINE';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Enable/disable logging by context
const LOG_ENABLED: Record<LogContext, boolean> = {
  STORE: true,
  EXPORT: true,
  CANVAS: true,
  SYNC: true,
  MEDIA: false, // Verbose, disable by default
  RENDER: true,
  TIMELINE: true,
};

/**
 * Main logging function
 */
export const log = (context: LogContext, level: LogLevel, message: string, data?: unknown) => {
  if (!LOG_ENABLED[context]) return;

  const timestamp = new Date().toISOString().substring(11, 23);
  const prefix = `[${timestamp}][${context}]`;

  switch (level) {
    case 'error':
      console.error(`${prefix} ${message}`, data !== undefined ? data : '');
      break;
    case 'warn':
      console.warn(`${prefix} ${message}`, data !== undefined ? data : '');
      break;
    case 'info':
      console.info(`${prefix} ${message}`, data !== undefined ? data : '');
      break;
    default:
      console.log(`${prefix} ${message}`, data !== undefined ? data : '');
  }
};

// Context-specific shortcuts
export const logStore = (msg: string, data?: unknown) => log('STORE', 'info', msg, data);
export const logExport = (msg: string, data?: unknown) => log('EXPORT', 'info', msg, data);
export const logSync = (msg: string, data?: unknown) => log('SYNC', 'info', msg, data);
export const logCanvas = (msg: string, data?: unknown) => log('CANVAS', 'info', msg, data);
export const logRender = (msg: string, data?: unknown) => log('RENDER', 'info', msg, data);
export const logTimeline = (msg: string, data?: unknown) => log('TIMELINE', 'info', msg, data);

// Error shortcuts
export const logError = (context: LogContext, msg: string, data?: unknown) => log(context, 'error', msg, data);
export const logWarn = (context: LogContext, msg: string, data?: unknown) => log(context, 'warn', msg, data);
