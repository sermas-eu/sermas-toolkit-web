import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import type { MqttMessageEvent } from './dto.js';
import { emitter } from './events.js';
import { Logger } from './logger.js';

export interface MqttClientOptions {
  url: string;
  appId: string;
  moduleId: string;
}

export class MqttClient {
  private readonly logger: Logger;
  private mqttClient: mqtt.MqttClient | undefined;

  private events: { pub: string[]; sub: string[] } = {
    pub: [],
    sub: [],
  };

  private appId?: string;
  private sessionId?: string;
  private userId?: string;
  private moduleId?: string;

  private topics: string[] = [];

  constructor(private readonly options: MqttClientOptions) {
    this.appId = this.options.appId;
    this.moduleId = this.options.moduleId;
    this.logger = new Logger(`broker <${this.moduleId}>`);
  }

  private addACLEvent(type: 'pub' | 'sub', ev: string) {
    if (this.events[type].includes(ev)) return;
    this.logger.debug(`EVT ${type} ${ev}`);
    this.events[type].push(ev);
  }

  getACLEvents() {
    return this.events;
  }

  setTopics(topics: string[]) {
    this.unsubscribeTopics();
    this.topics = topics;
    this.subscribeTopics();
  }

  setUserId(userId?: string) {
    if (this.userId !== userId) {
      this.userId = userId;
      this.resubscribe();
    }
  }

  setAppId(appId: string | undefined) {
    if (this.appId !== appId) {
      this.appId = appId;
      this.resubscribe();
    }
  }

  setSessionId(sessionId: string | undefined) {
    if (this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      this.resubscribe();
    }
  }

  resubscribe() {
    this.setTopics(this.topics);
  }

  subscribeTopics() {
    this.mapTopics(this.topics).map((topic) => this.subscribe(topic));
  }

  unsubscribeTopics() {
    this.mapTopics(this.topics).forEach((t) => this.unsubscribe(t));
  }

  unsubscribe(topic: string) {
    this.logger.debug(`Unsubscribing ${topic}`);
    if (!this.isConnected()) {
      this.logger.debug(`Cannot unsubsribe, not connected`);
      return;
    }
    this.mqttClient?.unsubscribe(topic);
  }

  isConnected(): boolean {
    if (!this.mqttClient) return false;
    return this.mqttClient.connected;
  }

  disconnect(): void {
    if (!this.mqttClient) return;
    this.unsubscribeTopics();
    this.mqttClient.disconnected;
    this.mqttClient = undefined;
  }

  getClient(): mqtt.MqttClient | undefined {
    return this.mqttClient;
  }

  subscribe(topics: string | string[]) {
    if (!this.isConnected()) {
      this.logger.debug(
        `MQTT not connected, cannot subscribe to ${JSON.stringify(topics)}`,
      );
      return;
    }
    this.mqttClient?.subscribe(topics, (e) => {
      if (e) {
        this.logger.warn(
          `failed subscription to ${JSON.stringify(topics)}: ${e.stack}`,
        );
      }
    });
  }

  publish(topic: string, data: any, json = true) {
    if (!this.mqttClient) {
      this.logger.error('Mqtt client not initialized');
      return;
    }

    if (this.userId && data.userId === undefined) data.userId = this.userId;
    if (this.sessionId && data.sessionId === undefined)
      data.sessionId = this.sessionId;
    data.appId = this.appId;
    data.source = this.options.moduleId;

    try {
      if (!this.isConnected()) {
        this.logger.debug(`Cannot send, not connected`);
        return;
      }
      const [resource, scope] = topic.split('/');
      this.addACLEvent('pub', `${resource}.${scope}`);
      this.mqttClient.publish(
        `app/${this.options.appId}/${topic}`,
        json ? JSON.stringify(data) : data,
        { qos: 2, retain: false },
      );
    } catch (e: any) {
      this.logger.warn(`Failed to send: ${e.message}`);
    }
  }

  mapTopics(topics: string[]): string[] {
    return topics.map((topicTemplate) => {
      let topic = topicTemplate;
      if (this.appId) topic = topic.replace(':appId', this.appId);
      if (this.sessionId) topic = topic.replace(':sessionId', this.sessionId);
      if (this.userId) topic = topic.replace(':userId', this.userId);
      topic = topic.replace(/(:.+)$/g, '+');
      return topic;
    });
  }

  onClientConnected() {
    if (!this.mqttClient) return;

    this.subscribeTopics();
  }

  onMessage(topic: string, payload: Buffer, packet: mqtt.IPublishPacket) {
    this.logger.debug(`MSG ${topic}`);
    try {
      let decoded: any = payload;
      try {
        try {
          // will throw an error in case of non text data
          decoded = decoded.toString();
        } catch (e) {
          this.logger.error('Failed decoding payload', e);
        }

        if (decoded && decoded.match(/^[{|[]/)) decoded = JSON.parse(decoded);
      } catch (e: any) {
        this.logger.debug(
          `Failed to parse message for topic ${topic}: ${e.stack}`,
        );
      }

      const [, appId, resource, scope, ...context] = topic.split('/');
      const ev: MqttMessageEvent = {
        topic,
        message: packet,
        payload: decoded,
        appId,
        resource,
        scope,
        context,
      };

      // emitter.emit('mqtt.message', ev)
      emitter.emit(`${resource}.${scope}`, ev.payload, ev);
      this.addACLEvent('sub', `${resource}.${scope}`);
      // this.logger.debug(`received mqtt event ${resource}.${scope} `, ev.payload)
    } catch (e: any) {
      this.logger.warn(`failed to parse mqtt message: ${e.message}`);
    }
  }

  async connect(token: string, retries = 0): Promise<void> {
    if (this.mqttClient) return;

    const prefix = '/mqtt';
    const brokerUrl = new URL(this.options.url);
    const useSSL = brokerUrl.protocol === 'https:';
    const mqttPort =
      brokerUrl.port && brokerUrl.port !== ''
        ? +brokerUrl.port
        : useSSL
          ? 443
          : 80;

    const mqttUrl = `ws${useSSL ? 's' : ''}://${brokerUrl.hostname}:${mqttPort}${prefix}`;
    this.logger.debug(`mqtt connecting to: ${mqttUrl} retries=${retries}`);

    const mqttClient = mqtt.connect(mqttUrl, {
      reconnectPeriod: 2000,
      username: token,
      password: 'mqtt',
      protocol: useSSL ? 'wss' : 'ws',
      clientId: uuidv4(),
      protocolVersion: 5,
      rejectUnauthorized: false,
      clean: true,
    });
    this.mqttClient = mqttClient;
    mqttClient.on('message', (topic, payload, packet) => {
      this.onMessage(topic, payload, packet);
    });
    mqttClient.on('connect', () => {
      this.logger.debug('connected');
      this.onClientConnected();
    });
    mqttClient.on('reconnect', () => {
      this.logger.warn(`mqtt client reconnect`);
    });
    mqttClient.on('disconnect', () => {
      this.logger.warn('disconnected');
    });
    mqttClient.on('close', () => {
      this.logger.warn('close');
    });
    mqttClient.on('error', (e) => {
      this.logger.error(`mqtt client connection error: ${e.stack}`);
    });
  }
}
