import type { ZBarSymbol } from '@undecaf/zbar-wasm';
import { VideoDetectorConfig } from '../video.dto.js';

export interface QrcodeDetectorConfig extends VideoDetectorConfig {}
export type QrcodeDetectorResult = ZBarSymbol[];
