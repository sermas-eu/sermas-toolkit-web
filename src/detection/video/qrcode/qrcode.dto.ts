import type { ZBarSymbol } from '@undecaf/zbar-wasm';
import { VideoDetectorConfig } from '../video.dto.js';

export type QrcodeDetectorConfig = VideoDetectorConfig;
export type QrcodeDetectorResult = ZBarSymbol[];
