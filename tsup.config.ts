import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  
  entry: [
    "./src/index.ts",
    "./src/utils.ts",
    "./src/detection/index.ts",
    "./src/detection/video/human/human.worker.ts",
    "./src/detection/video/mediapipe/v2/face-landmarker/index.ts",
    "./src/events/index.ts",
    "./src/dto/index.ts",
    "./src/ui/index.ts",
    "./src/avatar/index.ts",
    "./src/events/index.ts",
    "./src/settings/index.ts",
    "./src/ui/index.ts",
  ],

  target: 'es2020',
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  minify: !options.watch,
  clean: true,
  dts: true,
  silent: !options.watch,
  cjsInterop: false
}))
