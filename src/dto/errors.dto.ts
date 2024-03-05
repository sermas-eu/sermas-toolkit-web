export enum ErrorReason {
  MISSING_APP,
}

export interface ErrorEventDto {
  reason: ErrorReason;
}
