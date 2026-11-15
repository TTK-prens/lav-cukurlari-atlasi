import { describe, expect, it } from 'vitest';
import raw from '../data/eslesme.json';
import type { MatchDoc } from './types';
import { newGame, play, runPolicy, score, sensiblePolicy, siteFromCandidate, type SiteParams } from './game';

const doc = raw as unknown as MatchDoc;
const EN = new Map(doc.dunya.map((d) => [d.dunya_id, d.ad]));
const sites = doc.adaylar.map((c) => siteFromCandidate(c, (id) => EN.get(id)!)).filter(Boolean) as SiteParams[];
const idle = () => 'wait' as const;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('Mağara Üssü Görevi', () => {
  it('C adayları oyuna alınmaz; A/B adaylar alınır', () => {
    expect(doc.adaylar.filter((c) => c.kanit_seviyesi === 'C').every((c) => siteFromCandidate(c, () => '') === null)).toBe(true);
    expect(sites.length).toBeGreaterThan(10);
  });
  it('aynı tohum aynı sonucu verir', () => {
    const a = runPolicy(sites[0], 42, sensiblePolicy), b = runPolicy(sites[0], 42, sensiblePolicy);
    expect(score(a)).toBe(score(b));
    expect(a.log.map((l) => l.text.tr)).toEqual(b.log.map((l) => l.text.tr));
  });
  it('hiçbir A/B sahada NaN yok', () => {
    for (const p of sites) for (let seed = 1; seed <= 20; seed++) {
      const s = runPolicy(p, seed, sensiblePolicy);
      for (const v of [s.cargo, s.power, s.water, s.shield, s.health, s.science, s.risk, score(s)]) expect(Number.isFinite(v)).toBe(true);
      expect(s.done).toBe(true);
    }
  });
  it('makul strateji, hiçbir şey yapmamaktan iyi', () => {
    for (const p of sites) {
      const good = avg(Array.from({ length: 40 }, (_, i) => score(runPolicy(p, i + 1, sensiblePolicy))));
      const bad = avg(Array.from({ length: 40 }, (_, i) => score(runPolicy(p, i + 1, idle))));
      expect(good).toBeGreaterThan(bad);
    }
  });
  it('hem kazanmak hem kaybetmek mümkün', () => {
    const outs = new Set<string>();
    for (const p of sites) for (let seed = 1; seed <= 30; seed++) {
      outs.add(runPolicy(p, seed, sensiblePolicy).outcome!);
      outs.add(runPolicy(p, seed, idle).outcome!);
    }
    expect(outs.has('win')).toBe(true);
    expect(outs.has('loss')).toBe(true);
  });
  it('B sahasında doğrulamadan yerleşilemez; A sahasında doğrulama atlanır', () => {
    const b = sites.find((s) => s.level === 'B' && s.opening !== false)!;
    const s = play(newGame(b, 1), 'move_in');
    expect(s.inTube).toBe(false);
    const a = sites.find((s) => s.level === 'A')!;
    expect(newGame(a, 1).verified).toBe(true);
  });
  it('Ay sahasında buz kazılamaz (kaynaklı referans yok)', () => {
    const m = sites.find((s) => s.govde === 'ay')!;
    const s = play(newGame(m, 1), 'mine_ice');
    expect(s.water).toBe(0);
    expect(s.turn).toBe(1);
  });
});
