import { describe, expect, it } from 'vitest';
import raw from '../data/eslesme.json';
import { compare, costIndex, featureSim, iceDistanceKm, rankSites, type Features } from './match';
import type { MatchDoc } from './types';

const doc = raw as unknown as MatchDoc;
const F = (p: Partial<Features>): Features => ({ dD: null, overhang: null, acik_giris: null, termal: null, ...p });

describe('kaba buz mesafesi', () => {
  it('Elysium çukuru 23.21°K → ~698 km', () => {
    expect(iceDistanceKm(23.21, 'mars')).toBeCloseTo((35 - 23.21) * 59.2, 6);
    expect(Math.round(iceDistanceKm(23.21, 'mars')!)).toBe(698);
  });
  it('Dena −6.31° → ~2445 km; MARS-10 −11.29° → ~2740 km', () => {
    expect(Math.round(iceDistanceKm(-6.31, 'mars')!)).toBe(2446);
    expect(Math.round(iceDistanceKm(-11.29, 'mars')!)).toBe(2740);
  });
  it('35°K kuzeyi 0, Ay ve null için null', () => {
    expect(iceDistanceKm(40, 'mars')).toBe(0);
    expect(iceDistanceKm(10, 'ay')).toBeNull();
    expect(iceDistanceKm(null, 'mars')).toBeNull();
  });
});

describe('eşleştirme', () => {
  it('d/D benzerliği log-oran ile: eşit 1, 4 kat fark 0', () => {
    expect(featureSim('dD', 0.5, 0.5)).toBe(1);
    expect(featureSim('dD', 0.25, 1)).toBeCloseTo(0, 9);
    expect(featureSim('dD', 0.5, 1)).toBeCloseTo(0.5, 9);
  });
  it('null özellik atlanır, ağırlık yeniden dağıtılır', () => {
    const r = compare(F({ termal: true, dD: 0.5 }), F({ termal: true }));
    expect(r.benzerlik).toBe(1);
    expect(r.ortak).toBe(1);
    expect(r.kapsam).toBe(0.3);
    expect(r.alt).toBe(0.3);
    expect(r.ust).toBe(1);
    expect(r.guven).toBe('dusuk');
  });
  it('ortak özellik yoksa skor null (0 veya 1 değil)', () => {
    const r = compare(F({ dD: 0.5 }), F({ termal: true }));
    expect(r.benzerlik).toBeNull();
    expect(r.guven).toBe('yok');
  });
  it('dört ortak özellik → yüksek güven, bant sıfır genişlikte', () => {
    const r = compare(F({ dD: 0.5, overhang: true, acik_giris: true, termal: true }), F({ dD: 0.5, overhang: false, acik_giris: true, termal: true }));
    expect(r.guven).toBe('yuksek');
    expect(r.benzerlik).toBe(0.8);
    expect(r.alt).toBe(r.ust);
  });
  it('maliyet endeksi null bileşeni atlar', () => {
    const r = costIndex({ termal: 1, su: null, kalkan: 0.5, tugla: null, buz: null }, { termal: 1, su: 1, kalkan: 1, tugla: 1, buz: 1 });
    expect(r.endeks).toBe(0.75);
    expect(r.kapsam).toBe(0.4);
  });
});

describe('Python (build_matches.py) ↔ TS tutarlılığı', () => {
  const earth = new Map(doc.dunya.map((d) => [d.dunya_id, d]));
  it('her aday × ikiz için skor ve bant aynı', () => {
    let n = 0;
    for (const c of doc.adaylar) {
      const fa: Features = { dD: c.ozellikler.dD, overhang: c.ozellikler.overhang, acik_giris: c.ozellikler.acik_giris, termal: c.ozellikler.termal_tampon };
      for (const tw of c.ikizler) {
        const e = earth.get(tw.dunya_id)!;
        expect(e.sinif).toBe(c.sinif); // sınıf eşleşmesi zorunlu
        const r = compare(fa, e.ozellik);
        if (tw.benzerlik === null) expect(r.benzerlik).toBeNull();
        else {
          expect(Math.abs(r.benzerlik! - tw.benzerlik)).toBeLessThan(0.0021);
          expect(Math.abs(r.alt! - tw.bant![0])).toBeLessThan(0.0021);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('Dena (MARS-01) en az bir özelliği paylaşan bir ikize sahip', () => {
    const d = doc.adaylar.find((c) => c.aday_id === 'MARS-01')!;
    expect(d.ikizler[0].ortak_ozellik).toBeGreaterThan(0);
  });
  it('Hebrus (karst) yalnız karst ikizlerle eşleşir', () => {
    const h = doc.adaylar.find((c) => c.aday_id === 'MARS-14')!;
    expect(h.ikizler.every((t) => earth.get(t.dunya_id)!.sinif === 'karst')).toBe(true);
  });
  it('hiçbir Mars adayı A seviyesinde değil', () => {
    expect(doc.adaylar.filter((c) => c.govde === 'mars' && c.kanit_seviyesi === 'A')).toHaveLength(0);
  });
});

describe('üs sıralaması', () => {
  const w = { termal: 1, su: 1, kalkan: 1, tugla: 1, buz: 1 };
  it('C seviyesi dışarıda, A önce', () => {
    const r = rankSites(doc.adaylar, 'ay', w);
    expect(r.every((x) => x.c.kanit_seviyesi !== 'C')).toBe(true);
    expect(r[0].c.kanit_seviyesi).toBe('A');
  });
  it('az verili aday tam verili adayı geçemez (temkinli endeks)', () => {
    const r = rankSites(
      [
        { aday_id: 'X', govde: 'mars', kanit_seviyesi: 'B', maliyet: { termal: null, su: null, kalkan: 1, tugla: 1, buz: null } },
        { aday_id: 'Y', govde: 'mars', kanit_seviyesi: 'B', maliyet: { termal: 1, su: 0.5, kalkan: 0.8, tugla: 1, buz: 0.5 } },
      ],
      'mars',
      w,
    );
    expect(r[0].c.aday_id).toBe('Y');
  });
});

import layers from '../data/katmanlar.json';
describe('harita katmanları', () => {
  const L = layers as unknown as { mgc3: { kayitlar: { lat: number; lon180: number; p: number | null; t: string }[]; tip: Record<string, unknown> }; tupler: { kaynak: string[] }[] };
  it('MGC3 1062 kayıt, koordinatlar geçerli, tip kodları tanımlı', () => {
    expect(L.mgc3.kayitlar.length).toBe(1062);
    for (const m of L.mgc3.kayitlar) {
      expect(Math.abs(m.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(m.lon180)).toBeLessThanOrEqual(180);
      expect(L.mgc3.tip[m.t]).toBeTruthy();
    }
  });
  it('her tüp kanıtının kaynağı kaynak tablosunda var', () => {
    const ids = new Set(doc.kaynaklar.map((s) => s.kaynak_id));
    for (const t of L.tupler) for (const k of t.kaynak) expect(ids.has(k)).toBe(true);
  });
});

import images from '../data/gorseller.json';
import { existsSync } from 'node:fs';
describe('görseller', () => {
  const I = images as unknown as Record<string, { file: string; credit: string; license: string; source_url: string }>;
  it('her görselin dosyası, atfı, lisansı ve kaynak linki var', () => {
    for (const [id, im] of Object.entries(I)) {
      expect(existsSync(`public/img/${im.file}`), id).toBe(true);
      expect(im.credit.length, id).toBeGreaterThan(2);
      expect(im.license.length, id).toBeGreaterThan(2);
      expect(im.source_url, id).toMatch(/^https:\/\//);
    }
  });
  it('13 Dünya kaydının hepsinin görseli var', () => {
    for (const d of doc.dunya) expect(I[d.dunya_id], d.dunya_id).toBeTruthy();
  });
});
