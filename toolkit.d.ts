import { AvatarModel } from './src/avatar';
import { SermasToolkit } from './src';

declare global {
  interface Window {
    SERMAS: {
      Toolkit?: SermasToolkit;
      Avatar?: AvatarModel;
      developerMode?: () => void;
    };
  }
}

export {};
