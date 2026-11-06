import { describe, expect, it } from 'vitest';
import { interactionPercentile, shouldTrackVitals } from '../components/WebVitals';

describe('web vitals beacon helpers', () => {
  it('takes the 98th percentile of interaction durations', () => {
    expect(interactionPercentile([])).toBeNull();
    expect(interactionPercentile([120])).toBe(120);
    expect(interactionPercentile([80, 120, 200, 300, 500])).toBe(500);
    const many = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(interactionPercentile(many)).toBe(98);
  });

  it('honours Do-Not-Track and required analytics consent', () => {
    expect(shouldTrackVitals('1', undefined)).toBe(false);
    expect(shouldTrackVitals('yes', undefined)).toBe(false);
    expect(shouldTrackVitals(null, undefined)).toBe(true);
    expect(
      shouldTrackVitals(null, {
        enabled: true,
        analyticsRequired: true,
      } as never),
    ).toBe(false);
    expect(
      shouldTrackVitals(null, {
        enabled: true,
        analyticsRequired: false,
      } as never),
    ).toBe(true);
  });
});
