import {
  DialogueMessageDto,
  DialogueMessageUIContentDto,
  SessionChangedDto,
  UIContentDto,
  sleep,
} from '@sermas/api-client';
import EventEmitter2, { ListenerFn } from 'eventemitter2';
import { SermasToolkit } from 'index.js';
import { AvatarAudioPlaybackStatus } from './avatar/index.js';
import { DialogueActor } from './dto/dialogue.dto';
import { SessionStatus } from './dto/session.dto';
import { ChatMessage, UiButtonSession } from './dto/ui.dto.js';
import { EventListenerTracker, emitter } from './events.js';
import { Logger } from './logger.js';
import { deepCopy, getChunkId, getMessageId } from './utils.js';

export class UI {
  private readonly logger = new Logger('UI');

  private readonly emitter: EventEmitter2;
  private readonly listeners: EventListenerTracker;

  private history: ChatMessage[] = [];
  private initialized = false;

  constructor(private readonly toolkit: SermasToolkit) {
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

    this.emitter.on('dialogue.messages', this.onChatMessage); // arrivo messaggi dal be
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
    this.history = this.history || [];
    this.history.push(message);
    this.setHistory(this.history);
  }

  newChatMessage(actor: DialogueActor, ev?: UIContentDto): ChatMessage {
    return {
      actor,
      ts: new Date(),
      messages: ev ? [ev] : [],
    };
  }

  onPlaybackChanged(ev: AvatarAudioPlaybackStatus) {
    this.emitter.emit('ui.avatar.speaking', ev.status !== 'ended');
  }

  onUIContent(ev: UIContentDto) {
    this.appendContent('agent', ev);
  }

  onChatMessage(ev: DialogueMessageDto) {
    this.logger.debug(
      `Received chat message actor=${ev.actor} sessionId=${ev.sessionId} appId=${ev.appId}`,
    );

    const content: UIContentDto = {
      contentType: 'dialogue-message',
      content: ev,
      appId: ev.appId,
      chunkId: ev.chunkId,
      messageId: ev.messageId,
      metadata: {
        avatar: ev.avatar,
      },
      options: {},
      ts: new Date().toString(),
    };

    const actor = ev.actor as DialogueActor;
    this.appendContent(actor, content);
  }

  private setHistory(history?: ChatMessage[]) {
    history = history || [];
    history.forEach((m) => {
      m.messages = m.messages.sort((a, b) => {
        return a.messageId! > b.messageId! ? 1 : -1;
      });
    });
    this.history = history;
    this.emitter.emit('ui.dialogue.history', this.history);
  }

  async clear() {
    this.stopAvatarSpeech(getChunkId());
    this.clearHistory();
  }

  async handleCleanScreen(ev: UIContentDto) {
    if (ev.options && ev.options.stopSpeech) {
      this.logger.debug(`Stop avatar speech`);
      this.stopAvatarSpeech(ev.chunkId || getChunkId());
    }

    if (
      ev.contentType === 'clear-screen' ||
      (ev.options && ev.options.clearScreen)
    ) {
      this.logger.debug(`Clear screen`);
      this.clearHistory();
    }

    await sleep(100);
  }

  async appendContent(actor: DialogueActor, ev: UIContentDto) {
    if (
      this.toolkit.getSessionId() &&
      ev.sessionId &&
      this.toolkit.getSessionId() !== ev.sessionId
    )
      return;

    if (ev.content) {
      ev.content.messageId = ev.content.messageId || getChunkId();
      ev.content.chunkId = ev.content.chunkId || getChunkId();
    }

    // this.logger.debug(`ev ${JSON.stringify(ev)}`);
    this.logger.debug(
      `Adding UI content contentType=${ev.contentType} for actor=${actor}`,
    );

    await this.handleCleanScreen(ev);

    if (ev.contentType == 'navigation') {
      this.emitter.emit('ui.tool.request', ev.content);
      return;
    }

    if (ev.contentType === 'clear-screen') {
      return;
    }

    // append to same actor, create a new group otherwise
    if (
      !this.history.length ||
      this.history[this.history.length - 1].actor !== actor
    ) {
      // this.logger.debug(`Add new message from ${actor} : ${JSON.stringify(ev.content)}`)
      this.addHistory(this.newChatMessage(actor, undefined));
    }

    const messageId = ev.messageId || getMessageId();
    ev.messageId = messageId;
    ev.chunkId = ev.chunkId || getChunkId();
    ev.ts = ev.ts || new Date().toString();

    const lastIndex = this.history.length ? this.history.length - 1 : 0;
    const lastItem = this.history[lastIndex];

    lastItem.messages = lastItem.messages || [];

    if (ev.contentType !== 'dialogue-message') {
      lastItem.messages.push(ev);
      lastItem.messages = lastItem.messages.sort(this.sortChunks);
      this.setHistory(this.history);
      return;
    }

    // console.log(
    //   '--- [add message]',
    //   ev.messageId,
    //   ev.chunkId,
    //   ev.content?.text,
    // );

    const filtered = lastItem.messages.filter((m) => m.messageId === messageId);

    const message: UIContentDto = filtered.length
      ? filtered[0]
      : {
          appId: ev.appId,
          contentType: 'dialogue-message',
          messageId: ev.messageId,
          content: { text: '' },
          metadata: { chunks: [] },
        };

    if (!filtered.length) {
      lastItem.messages.push(message);
    }

    const chunks: DialogueMessageUIContentDto[] = (message.metadata?.chunks
      ? message.metadata?.chunks
      : []) as unknown as DialogueMessageUIContentDto[];

    chunks.push(deepCopy(ev) as DialogueMessageUIContentDto);

    // console.log('chunks', chunks.map((c) => c.content.text).join('\n'));

    message.metadata = message.metadata || {};
    message.metadata.chunks = chunks;

    message.content.text = chunks
      .sort(this.sortChunks)
      .map((c) => c.content.text)
      .join('');

    this.setHistory(this.history);
  }

  protected sortChunks(a: UIContentDto, b: UIContentDto) {
    return (a.chunkId || getChunkId()) >= (b.chunkId || getChunkId()) ? 1 : -1;
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

  async stopAvatarSpeech(chunkId?: string) {
    this.emitter.emit('avatar.speech.stop', chunkId);
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
