export interface TriggerRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
}

export interface PopoverPositionInput {
  readonly trigger: TriggerRect;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Preferred width (e.g. fits longest source name); clamped to [trigger width, maxWidth]. */
  readonly desiredWidth: number;
  readonly maxWidth?: number;
  readonly margin?: number;
  readonly gap?: number;
  /** Flip above when the space below is under this and smaller than the space above. */
  readonly flipThreshold?: number;
  readonly maxHeightFraction?: number;
}

export interface PopoverPosition {
  readonly placement: 'below' | 'above';
  /** Set when placement is 'below'. */
  readonly top?: number;
  /** Distance from viewport bottom; set when placement is 'above'. */
  readonly bottom?: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

/**
 * Pure fixed-position placement for a popover anchored to a trigger.
 * Opens below by default, flips above when there is little room below and more above,
 * clamps height to the available space on the chosen side,
 * and clamps horizontally to the viewport.
 */
export function computePopoverPosition(input: PopoverPositionInput): PopoverPosition {
  const {
    trigger,
    viewportWidth,
    viewportHeight,
    desiredWidth,
    maxWidth = 480,
    margin = 10,
    gap = 4,
    flipThreshold = 320,
    maxHeightFraction = 0.7,
  } = input;

  const spaceBelow = viewportHeight - trigger.bottom - gap - margin;
  const spaceAbove = trigger.top - gap - margin;
  const placement: 'below' | 'above' =
    spaceBelow < flipThreshold && spaceBelow < spaceAbove ? 'above' : 'below';

  const available = placement === 'below' ? spaceBelow : spaceAbove;
  // Never exceed the space on the chosen side (the larger side is chosen when below is cramped),
  // so the popover is never cut off; capped to a fraction of the viewport.
  const maxHeight = Math.max(0, Math.min(available, viewportHeight * maxHeightFraction));

  const widthLimit = Math.max(0, viewportWidth - 2 * margin);
  const width = Math.min(widthLimit, Math.max(trigger.width, Math.min(desiredWidth, maxWidth)));
  const left = Math.max(margin, Math.min(trigger.left, viewportWidth - width - margin));

  return placement === 'below'
    ? { placement, top: trigger.bottom + gap, left, width, maxHeight }
    : { placement, bottom: viewportHeight - trigger.top + gap, left, width, maxHeight };
}
