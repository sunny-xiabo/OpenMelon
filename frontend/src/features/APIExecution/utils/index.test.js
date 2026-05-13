import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  maskSensitiveConfig,
  normalizeNonNegativeInt,
  parseJsonObjectText,
  validateBaseUrl,
} from './index';

describe('APIExecution utils', () => {
  it('formats durations across millisecond, second and minute ranges', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(380)).toBe('380 ms');
    expect(formatDuration(1530)).toBe('1.53 s');
    expect(formatDuration(125000)).toBe('2 min 5 s');
  });

  it('parses JSON objects with fallback for invalid or non-object values', () => {
    expect(parseJsonObjectText('{"a":1}', {})).toEqual({ a: 1 });
    expect(parseJsonObjectText('[1,2]', { fallback: true })).toEqual({ fallback: true });
    expect(parseJsonObjectText('bad-json', { ok: false })).toEqual({ ok: false });
  });

  it('masks sensitive config keys without changing regular keys', () => {
    expect(maskSensitiveConfig({
      Authorization: 'Bearer abc',
      apiKey: 'secret',
      baseUrl: 'http://localhost:8000',
    })).toEqual({
      Authorization: '******',
      apiKey: '******',
      baseUrl: 'http://localhost:8000',
    });
  });

  it('validates base URLs and catches common localhost typo', () => {
    expect(validateBaseUrl('http://localhost:8000')).toEqual({ ok: true, value: 'http://localhost:8000' });
    expect(validateBaseUrl('http://locahost:8000').ok).toBe(false);
    expect(validateBaseUrl('not a url').ok).toBe(false);
  });

  it('normalizes non-negative integers', () => {
    expect(normalizeNonNegativeInt('5')).toBe(5);
    expect(normalizeNonNegativeInt('-1', 2)).toBe(2);
    expect(normalizeNonNegativeInt('abc', 3)).toBe(3);
  });
});
