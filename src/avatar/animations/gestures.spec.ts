import { describe, expect, it } from 'vitest';
import {
  gestureClips,
  gestureKey,
  isLoopableGesture,
  nextGestureClip,
} from './gestures.js';

describe('gestures', () => {
  const available = [
    'idle_0',
    'waving_1',
    'waving_0',
    'show_left_0',
    'show_right_0',
    'talking_0',
  ];

  it('normalises a gesture name to its key', () => {
    expect(gestureKey('gesture_waving')).toBe('waving');
    expect(gestureKey('waving_0')).toBe('waving');
    expect(gestureKey('show_left_0')).toBe('show_left');
    expect(gestureKey('donotknow')).toBe('donotknow');
  });

  it('lists the clips of a key in index order, not those of a longer key', () => {
    expect(gestureClips(available, 'waving')).toEqual(['waving_0', 'waving_1']);
    expect(gestureClips(available, 'show')).toEqual([]);
    expect(gestureClips(available, 'show_left')).toEqual(['show_left_0']);
  });

  it('cycles through every variant, the single one included', () => {
    const first = nextGestureClip(available, 'waving');
    expect(first).toEqual({ label: 'waving_0', position: 0 });
    const second = nextGestureClip(available, 'waving', first!.position);
    expect(second).toEqual({ label: 'waving_1', position: 1 });
    expect(nextGestureClip(available, 'waving', second!.position)?.label).toBe(
      'waving_0',
    );
    expect(nextGestureClip(available, 'idle', 0)?.label).toBe('idle_0');
  });

  it('has nothing to play for a gesture without clips', () => {
    expect(nextGestureClip(available, 'donotknow')).toBeNull();
  });

  it('loops only idle, talking and listening', () => {
    expect(isLoopableGesture('idle_0')).toBe(true);
    expect(isLoopableGesture('talking')).toBe(true);
    expect(isLoopableGesture('waving_0')).toBe(false);
    expect(isLoopableGesture('donotknow_0')).toBe(false);
    expect(isLoopableGesture('idlewave_0')).toBe(false);
  });
});
