import { UIContentDto } from '@sermas/api-client';
import { DialogueActor } from './dialogue.dto.js';
import { SessionStatus } from './session.dto.js';

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
