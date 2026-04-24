export const brainPlanningLog = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    console.debug(`[Brain-Planning] ${msg}`, meta ?? ''),
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.info(`[Brain-Planning] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[Brain-Planning] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[Brain-Planning] ${msg}`, meta ?? ''),
};
