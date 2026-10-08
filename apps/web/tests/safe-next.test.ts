import { describe, expect, it } from 'vitest';
import { safeNext } from '../lib/safe-next.ts';

describe('safeNext', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/w/abc/p/def')).toBe('/w/abc/p/def');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    null,
  ])('refuses %s', (next) => {
    expect(safeNext(next)).toBe('/workspaces');
  });
});
