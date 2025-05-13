import { IPublishPacket } from 'mqtt';

export interface MqttMessageEvent {
  topic: string;
  message: IPublishPacket;
  appId: string;
  resource: string;
  scope: string;
  context: string[];
  payload?: any;
  properties?: { [key: string]: string };
}

export type UiStatusType = 'user' | 'system';

export interface UiStatus {
  scope?: UiStatusType;
  message: string;
}

export interface SystemProgressEvent {
  event: string;
  status?: string;
}
