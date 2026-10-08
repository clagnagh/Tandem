import { describe, expect, it } from 'vitest';
import { nextFreeSlug, slugify } from '../src/modules/workspaces/service.ts';

describe('slugify', () => {
  it('lower-cases and hyphenates', () => {
    expect(slugify('  Acme Rockets!  ')).toBe('acme-rockets');
  });

  it('drops accents and symbols', () => {
    expect(slugify('Café Équipe & Co.')).toBe('cafe-equipe-co');
  });

  it('falls back when nothing usable is left', () => {
    expect(slugify('🚀🚀')).toBe('workspace');
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('nextFreeSlug', () => {
  it('uses the base when it is free', () => {
    expect(nextFreeSlug('acme', [])).toBe('acme');
  });

  it('adds the smallest free number', () => {
    expect(nextFreeSlug('acme', ['acme', 'acme-2', 'acme-4'])).toBe('acme-3');
  });
});
