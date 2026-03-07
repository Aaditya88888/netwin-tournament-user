export const logger = {
  info: (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    },
  error: (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] ERROR: ${message}`);
  },
  warn: (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.warn(`[${timestamp}] WARN: ${message}`);
  },
  debug: (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.debug(`[${timestamp}] DEBUG: ${message}`);
  }
};

export function log(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  }