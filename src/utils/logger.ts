/**
 * Simple development logger
 * Console logs are gated behind development mode check
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  /**
   * Log informational messages (development only)
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log warnings (always shown)
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Log errors (always shown)
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /**
   * Log debug messages (development only)
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};
