import type {
  AppPromptDto,
  AppSettingsDto,
  InteractionStartTypes,
} from '@sermas/api-client';

export class AppSettings implements AppSettingsDto {
  enableTestFaces: boolean;
  testFace: string;
  enableAvatar: boolean;
  enableAnimation: boolean;
  enableMirrorMode: boolean;
  enableMic: boolean;
  enableAudio: boolean;
  enableVideoDetection: boolean;
  animation: string;
  animationList: string[];
  showVideo: boolean;
  devMode: boolean;
  rpmUrl: string;
  rpmGender: string;
  detectorHuman: boolean;
  qrcode: boolean;
  detectorFaceLandmarker: boolean;
  avatar: string;
  background: string;
  language: string;
  llm: string;
  login: boolean;
  prompt?: AppPromptDto | undefined;
  interactionStart?: InteractionStartTypes;
}
