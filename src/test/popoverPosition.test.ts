import { describe, it, expect } from 'vitest';
import { computePopoverPosition } from '../components/multiview/popoverPosition';

const trigger = (top: number, left = 100, width = 180) => ({
  top,
  bottom: top + 24,
  left,
  width,
});

describe('computePopoverPosition', () => {
  it('opens below with room, capped to 70% of viewport', () => {
    const p = computePopoverPosition({
      trigger: trigger(100),
      viewportWidth: 1920,
      viewportHeight: 1080,
      desiredWidth: 360,
    });
    expect(p.placement).toBe('below');
    expect(p.top).toBe(128);
    expect(p.bottom).toBeUndefined();
    expect(p.maxHeight).toBe(756);
  });

  it('flips above when below is cramped and above has more room', () => {
    const p = computePopoverPosition({
      trigger: trigger(600),
      viewportWidth: 1280,
      viewportHeight: 700,
      desiredWidth: 360,
    });
    expect(p.placement).toBe('above');
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(700 - 600 + 4);
    expect(p.maxHeight).toBeCloseTo(490, 5); // 70% of 700 (space above is 586)
  });

  it('stays below when below is cramped but above is smaller', () => {
    const p = computePopoverPosition({
      trigger: trigger(40),
      viewportWidth: 1280,
      viewportHeight: 400,
      desiredWidth: 360,
    });
    expect(p.placement).toBe('below');
    expect(p.maxHeight).toBe(280); // 70% of 400 (space below is 322)
  });

  it('never exceeds available space on a very short window and never goes negative', () => {
    const p = computePopoverPosition({
      trigger: trigger(0),
      viewportWidth: 800,
      viewportHeight: 100,
      desiredWidth: 360,
    });
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
    expect(p.maxHeight).toBeLessThanOrEqual(100 - 24 - 4 - 10);
  });

  it('clamps horizontally to the viewport and caps width at 480', () => {
    const right = computePopoverPosition({
      trigger: trigger(100, 1800, 150),
      viewportWidth: 1920,
      viewportHeight: 1080,
      desiredWidth: 900,
    });
    expect(right.width).toBe(480);
    expect(right.left + right.width).toBeLessThanOrEqual(1920 - 10);
    const narrow = computePopoverPosition({
      trigger: trigger(100, 5, 150),
      viewportWidth: 300,
      viewportHeight: 800,
      desiredWidth: 480,
    });
    expect(narrow.width).toBe(280);
    expect(narrow.left).toBe(10);
  });

  it('is at least as wide as the trigger', () => {
    const p = computePopoverPosition({
      trigger: trigger(100, 100, 420),
      viewportWidth: 1920,
      viewportHeight: 1080,
      desiredWidth: 200,
    });
    expect(p.width).toBe(420);
  });
});
