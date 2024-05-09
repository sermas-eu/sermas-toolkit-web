export { FpsMonitor, type PerformanceEvent } from './fps.js';
export { addGlobal } from './global.js';
export { Logger, logger } from './logger.js';

export const getChunkId = () => +(Date.now() + performance.now());
