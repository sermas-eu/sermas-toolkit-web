export enum AgentStatus {
  // ko
  unavailable = -3000,
  error = -2000,
  not_ready = -1000,
  // ok
  ready = 1000,
  loading = 2000,
  interacting = 3000,
  waiting = 4000,
  processing = 5000,
}

export type UserReferenceSource = string;

export type SessionStatus = 'started' | 'stopped';

export type SessionStatusEvent = {
  status: 'closed' | 'updated' | 'created';
  sessionId: string;
};
