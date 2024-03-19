export const toolkitAliases = {
    // <sermas-toolkit-web>
    // NOTE: keep in line with toolkit 'exports' defined in @sermas/toolkit/package.json 
    "@sermas/toolkit/utils": "../sermas-toolkit-web/src/utils.ts",
    "@sermas/toolkit/detectors/human.worker": "../sermas-toolkit-web/src/detection/video/human/human.worker.ts",
    "@sermas/toolkit/detectors/face-landmarker": "../sermas-toolkit-web/src/detection/video/mediapipe/v2/face-landmarker/index.ts",
    "@sermas/toolkit/detection": "../sermas-toolkit-web/src/detection/index.ts",
    "@sermas/toolkit/events": "../sermas-toolkit-web/src/events.ts",
    "@sermas/toolkit/dto": "../sermas-toolkit-web/src/dto.ts",
    "@sermas/toolkit/ui": "../sermas-toolkit-web/src/ui.ts",
    "@sermas/toolkit/avatar": "../sermas-toolkit-web/src/avatar/index.ts",
    "@sermas/toolkit/settings": "../sermas-toolkit-web/src/settings.ts",

    '@sermas/toolkit': '../sermas-toolkit-web/src',
    '@sermas/toolkit/*': '../sermas-toolkit-web/*',

    // </sermas-toolkit-web>

}