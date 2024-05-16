import { ulid } from 'ulidx';

export { FpsMonitor, type PerformanceEvent } from './fps.js';
export { addGlobal } from './global.js';
export { Logger, logger, setDefaultLogLevel } from './logger.js';

export const getChunkId = (ts?: Date) =>
  ulid(ts ? new Date(ts).getTime() : undefined);

export const getMessageId = (ts?: Date) => getChunkId(ts);

export const deepCopy = <T = any>(obj: T) =>
  JSON.parse(JSON.stringify(obj)) as T;
