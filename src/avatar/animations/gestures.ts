/**
 * Gesture clips are named `<key>_<index>` inside the `gesture` group (`idle_0`,
 * `waving_1`, …), whether they come from the kiosk's `/animations/*.glb` or from the
 * avatar model itself.
 */

// gestures that loop (ping-pong) until another one replaces them; any other gesture
// plays once and hands back to idle
export const LOOPABLE_GESTURES = ['idle', 'talking', 'listening'];

export const isLoopableGesture = (name: string): boolean =>
  LOOPABLE_GESTURES.some((g) => name === g || name.startsWith(`${g}_`));

/** `gesture_waving`, `waving` or `waving_0` -> `waving`. */
export const gestureKey = (name: string): string =>
  name.replace(/^gesture_/, '').replace(/_\d+$/, '');

/** The clip labels available for a gesture key, in index order. */
export const gestureClips = (available: string[], key: string): string[] =>
  available
    .filter(
      (n) => n.startsWith(`${key}_`) && /^\d+$/.test(n.slice(key.length + 1)),
    )
    .sort(
      (a, b) =>
        Number(a.slice(key.length + 1)) - Number(b.slice(key.length + 1)),
    );

/**
 * The clip to play for a gesture, cycling through its variants on each call.
 * `last` is the position played last time (undefined on the first call).
 */
export const nextGestureClip = (
  available: string[],
  key: string,
  last?: number,
): { label: string; position: number } | null => {
  const clips = gestureClips(available, key);
  if (!clips.length) return null;
  const position = last === undefined ? 0 : (last + 1) % clips.length;
  return { label: clips[position], position };
};
