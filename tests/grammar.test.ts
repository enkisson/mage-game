import { describe, expect, it } from 'vitest';
import { resolve, sentenceKey, sentencesFor } from '../src/magic/grammar';

describe('sentences', () => {
  it('reads a single word', () => {
    const r = resolve(['fire']);
    expect(r.ok && r.spell.name).toBe('Firebolt');
    expect(r.ok && r.spell.cost).toBe(15);
  });

  it('treats word order as the same thought', () => {
    expect(sentenceKey(['push', 'fire'])).toBe('fire+push');
    const a = resolve(['push', 'fire']);
    const b = resolve(['fire', 'push']);
    expect(a.ok && b.ok && a.spell.key === b.spell.key).toBe(true);
    expect(a.ok && a.spell.name).toBe('Flame Wave');
  });

  it('gives the doubled word its great form', () => {
    const r = resolve(['stone', 'stone']);
    expect(r.ok && r.spell.effect.kind).toBe('pillar');
    expect(r.ok && r.spell.cost).toBe(35);
  });

  it('refuses a third word until it has been learned', () => {
    expect(resolve(['fire', 'fire', 'fire'])).toEqual({ ok: false, reason: 'too-long' });
  });

  it('refuses words that are not built yet', () => {
    expect(resolve(['ice'])).toEqual({ ok: false, reason: 'unformed' });
    expect(resolve([])).toEqual({ ok: false, reason: 'empty' });
  });

  it('grows with every word you know', () => {
    expect(sentencesFor(['fire']).map((s) => s.name)).toEqual(['Firebolt', 'Fireball']);
    expect(sentencesFor(['fire', 'push'])).toHaveLength(5);
    expect(sentencesFor(['fire', 'push', 'stone'])).toHaveLength(9);
    expect(sentencesFor(['fire', 'push', 'stone', 'wind'])).toHaveLength(14);
  });

  it('marks which sentences the mage wrote down', () => {
    const all = sentencesFor(['fire', 'push', 'stone', 'wind']);
    const own = all.filter((s) => !s.authored).map((s) => s.name).sort();
    expect(own).toEqual(['Flame Wave', 'Gale', 'Magma', 'Rockslide', 'Sandstorm', 'Shockwave', 'Wildfire']);
  });
});
