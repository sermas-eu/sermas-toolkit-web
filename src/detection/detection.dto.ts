export type WorkerMessageType = 'init' | 'process' | 'render' | 'destroy';

export interface WorkerMessage extends Record<string, any> {
  type: WorkerMessageType;
  data: any;
}
