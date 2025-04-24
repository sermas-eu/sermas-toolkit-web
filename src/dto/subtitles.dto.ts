export interface SubtitleMessage {
  id: string;
  message: string;
}

export interface messageQueue {
  [chunkId: string]: {
    message: string;
    messageList: messageListDto[];
    id: string;
    duration: number;
  };
}

export interface messageListDto {
  text: string;
  durationPercentage: number;
}
