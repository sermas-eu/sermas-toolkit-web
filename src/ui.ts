import {
  DialogueMessageDto,
  DialogueMessageUIContentDto,
  DialogueProgressEventDto,
  SessionChangedDto,
  UIContentDto,
  sleep,
} from '@sermas/api-client';
import EventEmitter2, { ListenerFn } from 'eventemitter2';
import { SermasToolkit } from 'index.js';
import {
  AvatarAudioPlaybackStatus,
  AvatarStopSpeechReference,
} from './avatar/index.js';
import { DialogueActor } from './dto/dialogue.dto';
import { SessionStatus } from './dto/session.dto';
import {
  ChatMessage,
  RequestProcessing,
  UiButtonSession,
  UserSpeaking,
} from './dto/ui.dto.js';
import { EventListenerTracker } from './events.js';
import { Logger } from './logger.js';
import { deepCopy, getChunkId, getMessageId } from './utils.js';

export class UI {
  private readonly logger = new Logger('UI');

  private readonly emitter: EventEmitter2;
  private readonly listeners: EventListenerTracker;

  private lastClearScreen: string;

  private history: ChatMessage[] = [];
  private initialized = false;

  constructor(private readonly toolkit: SermasToolkit) {
    this.emitter = toolkit.getEmitter();
    this.listeners = new EventListenerTracker(this.emitter);

    this.onSTTMessage = this.onSTTMessage.bind(this);
    this.onProgressMessage = this.onProgressMessage.bind(this);
    this.onChatMessage = this.onChatMessage.bind(this);
    this.onSessionChanged = this.onSessionChanged.bind(this);
    this.onAvatarSpeechCompleted = this.onAvatarSpeechCompleted.bind(this);
    this.onPlaybackChanged = this.onPlaybackChanged.bind(this);
    this.onUIContent = this.onUIContent.bind(this);
    this.onUserSpeech = this.onUserSpeech.bind(this);
  }

  async init() {
    if (this.initialized) await this.destroy();
    this.initialized = true;

    this.toolkit.getBroker().on('dialogue.stt', this.onSTTMessage); // arrivo messaggi dal be
    this.toolkit.getBroker().on('dialogue.progress', this.onProgressMessage); // arrivo messaggi dal be
    this.toolkit.getBroker().on('dialogue.messages', this.onChatMessage); // arrivo messaggi dal be
    this.toolkit.getBroker().on('session.session', this.onSessionChanged);
    this.toolkit.getBroker().on('ui.content', this.onUIContent);

    this.emitter.on('avatar.speech.completed', this.onAvatarSpeechCompleted);
    this.emitter.on('avatar.speech', this.onPlaybackChanged);
    this.emitter.on('detection.speech', this.onUserSpeech);
  }

  async destroy() {
    this.listeners.clear();

    this.toolkit.getBroker().off('dialogue.stt', this.onSTTMessage); // arrivo messaggi dal be
    this.toolkit.getBroker().off('dialogue.progress', this.onProgressMessage); // arrivo messaggi dal be
    this.toolkit.getBroker().off('dialogue.messages', this.onChatMessage);
    this.toolkit.getBroker().off('session.session', this.onSessionChanged);
    this.toolkit.getBroker().off('ui.content', this.onUIContent);

    this.emitter.off('avatar.speech', this.onPlaybackChanged);
    this.emitter.off('detection.speech', this.onUserSpeech);
    this.emitter.off('avatar.speech.completed', this.onAvatarSpeechCompleted);

    this.initialized = false;
  }

  onUserSpeech(ev: { speech: boolean }) {
    if (!ev.speech) return;
    this.requestProcessing({
      status: 'started',
    });
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

  onAvatarSpeechCompleted() {
    this.emitter.emit('ui.avatar.speaking', false);
  }

  onPlaybackChanged(ev: AvatarAudioPlaybackStatus) {
    this.emitter.emit('ui.avatar.speaking', ev.status === 'playing');
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
      isWelcome: ev.isWelcome ? ev.isWelcome : false,
    };

    const actor = ev.actor as DialogueActor;

    this.appendContent(actor, content);
  }

  onProgressMessage(ev: DialogueProgressEventDto) {
    this.logger.debug(
      `System progress event: ${ev.event} ${ev.status ? ev.status : ''}`,
    );
    this.emitter.emit('dialogue.progress', ev);
  }

  onSTTMessage(ev: DialogueMessageDto) {
    this.logger.debug(`STT event: ${JSON.stringify(ev)}`);
    //TODO: append to chat, then wait for confirmation
    // this.logger.debug(
    //   `Received STT message actor=${ev.actor} sessionId=${ev.sessionId} appId=${ev.appId}`,
    // );
    // const content: UIContentDto = {
    //   contentType: 'dialogue-message',
    //   content: ev,
    //   appId: ev.appId,
    //   chunkId: ev.chunkId,
    //   messageId: ev.messageId,
    //   metadata: {
    //     avatar: ev.avatar,
    //   },
    //   options: {},
    //   ts: new Date().toString(),
    //   isWelcome: ev.isWelcome ? ev.isWelcome : false,
    // };
    // const actor = ev.actor as DialogueActor;
    // this.appendContent(actor, content);
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
    this.stopAvatarSpeech(getMessageId(), getChunkId());
    this.clearHistory();
  }

  async handleCleanScreen(ev: UIContentDto) {
    if (ev.options && ev.options.stopSpeech) {
      this.logger.debug(`Stop avatar speech`);
      this.stopAvatarSpeech(
        ev.messageId || getMessageId(),
        ev.chunkId || getChunkId(),
      );
    }

    if (
      ev.contentType === 'clear-screen' ||
      (ev.options && ev.options.clearScreen)
    ) {
      this.lastClearScreen =
        ev.messageId || (ev.content as any)?.messageId || getMessageId();
      // this.logger.warn(
      //   `Set last clear screen ${ev.messageId} ${ev.ts ? new Date(ev.ts) : undefined}`,
      // );

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

    const lastMessageId = (ev.content as any)?.messageId || ev.messageId;
    // this.logger.log(
    //   `current messageId ${lastMessageId} ${ev.ts ? new Date(ev.ts) : undefined} | skip=${lastMessageId < this.lastClearScreen}`,
    // );
    if (
      this.lastClearScreen &&
      lastMessageId &&
      lastMessageId < this.lastClearScreen
    ) {
      this.logger.debug(
        `Skip ui content older than last clear screen ev.messageId=${ev.messageId} ev.content.messageId=${ev.content?.messageId} lastClearScreen=${this.lastClearScreen}`,
      );
      return;
    }

    if (ev.content) {
      const uiContent = ev.content as UIContentDto;
      uiContent.messageId = uiContent.messageId || getMessageId();
      uiContent.chunkId = uiContent.chunkId || getChunkId();
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
          isWelcome: ev.isWelcome,
        };

    if (!filtered.length) {
      lastItem.messages.push(message);
    }

    const chunks: DialogueMessageUIContentDto[] = (message.metadata?.chunks
      ? message.metadata?.chunks
      : []) as unknown[] as DialogueMessageUIContentDto[];

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

  async stopAvatarSpeech(messageId?: string, chunkId?: string) {
    this.emitter.emit('avatar.speech.stop', {
      messageId,
      chunkId,
    } as AvatarStopSpeechReference);
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

  userSpeaking(ev: UserSpeaking) {
    this.emitter.emit('ui.user.speaking', ev);
  }

  requestProcessing(ev: RequestProcessing) {
    this.emitter.emit('ui.user.request-processing', ev);
  }

  on(event: string, fn: ListenerFn) {
    this.listeners.add(event, fn);
    this.emitter.on(event, fn);
  }
}
