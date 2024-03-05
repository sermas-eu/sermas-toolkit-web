const PROCESSOR_PATH = `/src/lib/detection/audio/processor`;

export class MyWorkletNode extends AudioWorkletNode {
  constructor(context: any) {
    super(context, 'my-worklet-processor');
  }
}

export const createAudioWorklet = async () => {
  try {
    const context = new AudioContext();
    await context.audioWorklet.addModule(
      `${PROCESSOR_PATH}/processor.ts?t=${Date.now()}`,
    );
    const node = new MyWorkletNode(context);
  } catch (e) {
    console.error('createAudioWorklet errror', e);
  }
};
