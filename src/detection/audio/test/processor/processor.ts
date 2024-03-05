// This is "processor.js" file, evaluated in AudioWorkletGlobalScope upon
// audioWorklet.addModule() call in the main global scope.

export class MyWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    console.log('HELLO MyWorkletProcessor');
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    // audio processing code here.
    return true;
  }
}

registerProcessor('my-worklet-processor', MyWorkletProcessor);
