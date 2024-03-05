import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';

export const createAudioClassifier = async (): Promise<AudioClassifier> => {
  const audio = await FilesetResolver.forAudioTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0/wasm',
  );

  const audioClassifier = await AudioClassifier.createFromOptions(audio, {
    baseOptions: {
      delegate: 'GPU',
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
    },
    maxResults: 1,
  });

  return audioClassifier;
};
