export interface SubtitleMessage {
  id: string;
  mex: string;
}

export interface messageQueue {
  [chunkId: string]: {
    mex: string;
    messageList: messageListDto[];
    id: string;
    duration: number;
  };
}

export interface messageListDto {
  text: string;
  durationPercentage: number;
}
