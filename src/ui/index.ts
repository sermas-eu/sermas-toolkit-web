import EventEmitter2, { ListenerFn } from 'eventemitter2';
import { emitter } from '../events';
import { AvatarAudioPlaybackStatus } from '../avatar';
import { ChatMessage, UiButtonSession } from '../dto/ui.dto';
import { EventListenerTracker } from '../events';
import { Logger } from '../logger';
import { UIContentDto } from '@sermas/api-client';
import { DialogueActor } from 'dto/dialogue.dto';
import {
  DialogueMessageDto,
  SessionChangedDto,
} from '@sermas/api-client';
import { SessionStatus } from 'dto/session.dto';

export class UI {
  private readonly logger = new Logger('UI');

  private readonly emitter: EventEmitter2;
  private readonly listeners: EventListenerTracker;

  private history: ChatMessage[] = [];
  private initialized = false;

  constructor() {
    this.emitter = emitter;
    this.listeners = new EventListenerTracker(this.emitter);

    this.onChatMessage = this.onChatMessage.bind(this);
    this.onSessionChanged = this.onSessionChanged.bind(this);
    this.onPlaybackChanged = this.onPlaybackChanged.bind(this);
    this.onUIContent = this.onUIContent.bind(this);
  }

  async init() {
    if (this.initialized) await this.destroy();
    this.initialized = true;

    this.emitter.on('dialogue.messages', this.onChatMessage);
    this.emitter.on('session.session', this.onSessionChanged);
    this.emitter.on('avatar.speech', this.onPlaybackChanged);
    this.emitter.on('ui.content', this.onUIContent);
  }

  async destroy() {
    this.listeners.clear();

    this.emitter.off('dialogue.messages', this.onChatMessage);
    this.emitter.off('session.session', this.onSessionChanged);
    this.emitter.off('avatar.speech', this.onPlaybackChanged);
    this.emitter.off('ui.content', this.onUIContent);

    this.initialized = false;
  }

  clearHistory() {
    this.logger.debug('Clear history');
    this.setHistory([]);
  }

  detectMob() {
    const toMatch = [
      /Android/i,
      /webOS/i,
      /iPhone/i,
      /iPad/i,
      /iPod/i,
      /BlackBerry/i,
      /Windows Phone/i,
    ];

    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  }

  addHistory(message: ChatMessage) {
    this.history = this.history || []
    this.history.push(message)
    this.setHistory(this.history);
  }

  newChatMessage(actor: DialogueActor, ev: UIContentDto): ChatMessage {
    return {
      actor,
      ts: new Date(),
      messages: [ev],
    };
  }

  onPlaybackChanged(ev: AvatarAudioPlaybackStatus) {
    this.emitter.emit('ui.avatar.speaking', ev.status !== 'ended');
  }

  onUIContent(ev: UIContentDto) {
    this.logger.debug(
      `Got event contentType=${ev.contentType} ${JSON.stringify(ev.content)}`,
    );

    if (ev.contentType == 'navigation') {
      this.emitter.emit('ui.tool.request', ev.content);
      return;
    }

    if (ev.contentType === 'clear-screen') return this.clearHistory();
    if (ev.options && ev.options.clearScreen) this.clearHistory();

    this.appendContent('agent', ev);
  }

  onChatMessage(ev: DialogueMessageDto) {
    this.logger.debug(
      `Received chat message actor=${ev.actor} sessionId=${ev.sessionId} appId=${ev.appId}`,
    );

    const actor = ev.actor as DialogueActor;
    this.appendContent(actor, {
      contentType: 'dialogue-message',
      content: ev,
      appId: ev.appId,
      chunkId: ev.chunkId,
      messageId: ev.messageId,
      metadata: {},
      options: {},
    });
  }

  private setHistory(history?: ChatMessage[]) {
    history = history || [];
    this.history = history;
    this.emitter.emit('ui.dialogue.history', this.history);
  }

  getLastMessage(): UIContentDto | undefined {
    if (!this.history.length) return undefined;
    if (!this.history[0].messages || !this.history[0].messages.length)
      return undefined;
    return this.history[0].messages[this.history[0].messages.length - 1];
  }

  appendContent(actor: DialogueActor, ev: UIContentDto) {
    // append to same actor
    if (
      !this.history.length ||
      this.history[this.history.length - 1].actor !== actor
    ) {
      // this.logger.debug(`Add new message from ${actor} : ${JSON.stringify(ev.content)}`)
      this.addHistory(this.newChatMessage(actor, ev));
      return;
    }

    // do not show again if the last message is repeated eg "could you repeat?"
    const lastMessage = this.getLastMessage();
    if (lastMessage) {
      if (lastMessage.contentType === 'dialogue-message') {
        if (ev.content.text === lastMessage.content.text) {
          return;
        }
      }
    }

    // const sortFn = (a, b) => {
    //     const da = new Date(a.ts)
    //     const db = new Date(b.ts)
    //     console.log (da, db)
    //     if (da > db) return 1
    //     if (da < db) return -1
    //     return 0
    // }

    // this.logger.debug(`Append message from ${actor} ${JSON.stringify(ev.content)}`)

    const lastIndex = this.history.length - 1
    this.history[lastIndex].messages.push(ev);
    // this.history[this.history.length - 1].messages.sort(sortFn);
    this.history[lastIndex].messages.sort((a, b) => {
      const aChunckId = a.content.chunckId || performance.now();
      const bChunckId = b.content.chunckId || performance.now();
      return +aChunckId >= +bChunckId ? 1 : -1;
    });

    // this.logger.log(this.history[lastIndex])

    this.setHistory(this.history);
  }

  async updateSession(
    status: SessionStatus,
    source = 'avatar',
    trigger = 'button',
  ) {
    this.history = [];
    this.emitter.emit('ui.button.session', {
      status,
      source,
      trigger,
    } as UiButtonSession);
  }

  async stopAvatarSpeech() {
    this.emitter.emit('avatar.speech.stop');
  }

  onSessionChanged(ev: SessionChangedDto) {
    let status: SessionStatus | undefined = undefined;

    if (ev.operation === 'created') {
      status = 'started';
    } else if (ev.operation === 'updated' && ev.record.closedAt) {
      status = 'stopped';
    }

    if (status) {
      this.emitter.emit('ui.session.changed', status);
    }
  }

  on(event: string, fn: ListenerFn) {
    this.listeners.add(event, fn);
    this.emitter.on(event, fn);
  }
}
