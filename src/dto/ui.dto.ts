import { UIContentDto } from '@sermas/api-client/openapi';
import { DialogueActor } from './dialogue.dto';
import { SessionStatus } from './session.dto';

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
