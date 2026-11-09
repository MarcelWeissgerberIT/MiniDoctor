import { describe, it, expect } from 'vitest';
import { PARTS, SLOTS, PAYLOAD, defaultLoadout, sanitize, tonnage, validate, effects, ratings, nextUnlock } from '../src/logic/loadout.js';

describe('loadout', () => {
  it('the factory loadout fits the payload and is unlocked from the start', () => {
    const l = defaultLoadout();
    const v = validate(l, 0);
    expect(v.ok).toBe(true);
    expect(v.tons).toBeLessThan(PAYLOAD);
  });

  it('every slot has a part that is free from the start', () => {
    for (const [slot] of SLOTS) expect(Object.values(PARTS[slot]).some((p) => p.unlock === 0)).toBe(true);
  });

  it('a heavy everything build is over the payload', () => {
    const l = { ...defaultLoadout(), gun: 'rail', mg: 'hmg127', missiles: 'sl6', armor: 'heavy', lights: 'led', extra: 'plates' };
    const v = validate(l);
    expect(tonnage(l)).toBeGreaterThan(PAYLOAD);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/ÜBERLADEN/);
  });

  it('locked parts are refused, and sanitize falls back to the default', () => {
    const l = { ...defaultLoadout(), gun: 'rail' };
    expect(validate(l, 0).ok).toBe(false);
    expect(sanitize(l, 0).gun).toBe('ac30');
    expect(sanitize(l, 99).gun).toBe('rail');
    expect(sanitize({ gun: 'nonsense', callsign: 'wolf 1!' }).callsign).toBe('WOLF1');
  });

  it('armour trades protection for speed, weight slows the mech a little', () => {
    const light = effects({ ...defaultLoadout(), armor: 'light' });
    const heavy = effects({ ...defaultLoadout(), armor: 'heavy' });
    expect(light.speed).toBeGreaterThan(1);
    expect(heavy.speed).toBeLessThan(0.9);
    expect(heavy.armor).toBeGreaterThan(light.armor);
    const r = ratings({ ...defaultLoadout(), armor: 'heavy' });
    const r2 = ratings({ ...defaultLoadout(), armor: 'light' });
    expect(r.protect).toBeGreaterThan(r2.protect);
    expect(r.speed).toBeLessThan(r2.speed);
  });

  it('weapon stats come from the fitted parts', () => {
    const e = effects({ ...defaultLoadout(), gun: 'gat20', missiles: 'rw24' });
    expect(e.gun.rpm).toBe(900);
    expect(e.missile.guided).toBe(false);
    expect(e.missile.count).toBe(24);
    expect(ratings(defaultLoadout()).fire).toBeGreaterThan(0.4);
  });

  it('names the next part to unlock', () => {
    const n = nextUnlock(0);
    expect(n.unlock).toBe(1);
    expect(nextUnlock(99)).toBe(null);
  });
});
