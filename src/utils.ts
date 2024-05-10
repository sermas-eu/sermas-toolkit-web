export { FpsMonitor, type PerformanceEvent } from './fps.js';
export { addGlobal } from './global.js';
export { Logger, logger } from './logger.js';

export const getChunkId = () => +(Date.now() + performance.now());

export const deepCopy = <T = any>(obj: T) =>
  JSON.parse(JSON.stringify(obj)) as T;
