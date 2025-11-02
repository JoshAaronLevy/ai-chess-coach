const isDevelopment = import.meta.env.DEV;

export const logger = {
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  error: (...args: unknown[]) => {
    console.error(...args);
  },

  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};
