import { defineConfig } from 'tsup'

export default defineConfig({
  target: 'es2020',
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  minify: false,
  clean: true,
  dts: true,
  silent: true,
  cjsInterop: false
})