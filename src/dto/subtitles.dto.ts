export interface SubtitleMessage {
  id: string;
  mex: string;
}

export interface mexQueue {
  [chunkId: string]: {
    mex: string;
    mexList: string[];
    id: string;
    duration: number;
  };
}
