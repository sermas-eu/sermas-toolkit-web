import { type UIContentDto } from '@sermas/api-client';
import { type DialogueActor } from './dialogue.dto.js';
import { type SessionStatus } from './session.dto.js';

export interface ChatMessage {
  actor: DialogueActor;
  ts: Date;
  messages: UIContentDto[];
}

export interface UiButtonSession {
  status: SessionStatus;
  source: string;
  trigger: string;
}

export interface UserSpeaking {
  status: 'speaking' | 'noise' | 'completed';
}

export interface RequestProcessing {
  status: 'started' | 'failed' | 'completed';
}

export interface DialogueProgess {
  event: string;
  status?: string;
}
