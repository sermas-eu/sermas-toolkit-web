
const apiProxy = process.env.API_PROXY || 'http://traefik'
const mqttProxy = process.env.MQTT_PROXY || 'http://mqtt:1884'

// const nodeModulesBasePath = '../sermas-toolkit/'
const nodeModulesBasePath = './'

const copyFiles = [

    // @vladmandic/human
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/blazeface.json`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/antispoof.json`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/liveness.json`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/faceres.json`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/emotion.json`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/blazeface.bin`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/antispoof.bin`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/liveness.bin`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/faceres.bin`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@vladmandic/human/models/emotion.bin`, "human/models"],
    [`${nodeModulesBasePath}node_modules/@tensorflow/tfjs-backend-wasm/wasm-out/tfjs-backend-wasm-simd.wasm`, "tfjs-backend-wasm/wasm-out"],

    //ricky0123/vad-web
    [`${nodeModulesBasePath}node_modules/@ricky0123/vad-web/dist/silero_vad.onnx`, ''],
    [`${nodeModulesBasePath}node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js`, ''],
    //onnxruntime-web
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm-simd.jsep.wasm`, ''],
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm`, ''],
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm`, ''],
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm`, ''],
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm-threaded.wasm`, ''],
    [`${nodeModulesBasePath}node_modules/onnxruntime-web/dist/ort-wasm.wasm`, ''],
]

// vite server options
// https://vitejs.dev/config/server-options.html
export const SermasViteConfig = {
    server: {
        proxy: {
            '/api': apiProxy,
            '/mqtt': {
                target: mqttProxy,
                ws: true,
            },
        },
        // listen on 0.0.0.0
        host: true,
        // exit if port used
        strictPort: true
    }
}

export const getCopyFiles = () => {
    return copyFiles.map((filepath) => {
        const [src, dest] = filepath
        return {
            src,
            dest,
        }
    })
}