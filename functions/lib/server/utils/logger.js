export const logger = {
    info: (message) => {
        const timestamp = new Date().toLocaleTimeString();
    },
    error: (message) => {
        const timestamp = new Date().toLocaleTimeString();
        console.error(`[${timestamp}] ERROR: ${message}`);
    },
    warn: (message) => {
        const timestamp = new Date().toLocaleTimeString();
        console.warn(`[${timestamp}] WARN: ${message}`);
    },
    debug: (message) => {
        const timestamp = new Date().toLocaleTimeString();
        console.debug(`[${timestamp}] DEBUG: ${message}`);
    }
};
export function log(message) {
    const timestamp = new Date().toLocaleTimeString();
}
//# sourceMappingURL=logger.js.map