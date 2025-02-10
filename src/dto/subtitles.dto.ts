export interface SubtitleMessage {
  id: string;
  mex: string;
}

export interface mexQueue {
  [chunkId: string]: {
    mex: string;
    mexList: mexListDto[];
    id: string;
    duration: number;
  };
}

export interface mexListDto {
  text: string;
  durationPercentage: number;
}
