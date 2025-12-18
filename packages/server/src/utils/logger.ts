// Simple logger utility for consistent logging across the application

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.log(`[Pipeline] ${message}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(`[Pipeline] ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[Pipeline] ${message}`, ...args);
  },

  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Pipeline:DEBUG] ${message}`, ...args);
    }
  },
};
