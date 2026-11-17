import { describe, expect, it } from 'vitest';
import { duration, elapsed, money } from './format';

describe('format', () => {
  it('formats money from cents', () => {
    expect(money(475)).toBe('$4.75');
    expect(money(0)).toBe('$0.00');
  });

  it('formats elapsed time', () => {
    const now = Date.parse('2026-01-01T10:00:00Z');
    expect(elapsed('2026-01-01T09:59:30Z', now)).toBe('30s');
    expect(elapsed('2026-01-01T09:57:15Z', now)).toBe('2m 45s');
    expect(elapsed('2026-01-01T08:30:00Z', now)).toBe('1h 30m');
  });

  it('formats prep durations', () => {
    expect(duration(null)).toBe('—');
    expect(duration(95)).toBe('1m 35s');
  });
});
