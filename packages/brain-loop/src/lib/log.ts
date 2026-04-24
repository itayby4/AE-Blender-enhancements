export const brainLoopLog = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    console.debug(`[Brain-Loop] ${msg}`, meta ?? ''),
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.info(`[Brain-Loop] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[Brain-Loop] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[Brain-Loop] ${msg}`, meta ?? ''),
};
