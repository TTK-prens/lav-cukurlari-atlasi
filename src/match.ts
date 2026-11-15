// Eşleştirme ve maliyet çekirdeği. scripts/build_matches.py ile BİREBİR aynı formüller
// (src/match.test.ts, Python çıktısını bu fonksiyonlarla yeniden üretir).

export type FeatureKey = 'dD' | 'overhang' | 'acik_giris' | 'termal';
export interface Features {
  dD: number | null;
  overhang: boolean | null;
  acik_giris: boolean | null;
  termal: boolean | null;
}

export const WEIGHTS: Record<FeatureKey, number> = {
  dD: 0.35,
  overhang: 0.2,
  acik_giris: 0.15,
  termal: 0.3,
};
export const FEATURE_KEYS = Object.keys(WEIGHTS) as FeatureKey[];
const DD_LOG_SCALE = Math.log(4);

export const KM_PER_DEG_MARS = 59.2;
export const ICE_REF_LAT_MARS = 35;
export const ICE_DIST_SCALE_KM = 3000;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function featureSim(key: FeatureKey, a: number | boolean | null, b: number | boolean | null): number | null {
  if (a === null || b === null || a === undefined || b === undefined) return null;
  if (key === 'dD') {
    const x = a as number, y = b as number;
    if (x <= 0 || y <= 0) return null;
    return Math.max(0, 1 - Math.abs(Math.log(x / y)) / DD_LOG_SCALE);
  }
  return a === b ? 1 : 0;
}

export interface CompareResult {
  benzerlik: number | null;
  alt: number | null;
  ust: number | null;
  kapsam: number;
  ortak: number;
  ozellik: Record<FeatureKey, number | null>;
  guven: 'yuksek' | 'orta' | 'dusuk' | 'yok';
}

export function compare(fa: Features, fb: Features): CompareResult {
  const per = {} as Record<FeatureKey, number | null>;
  let num = 0, wsum = 0, n = 0;
  for (const k of FEATURE_KEYS) {
    const s = featureSim(k, fa[k], fb[k]);
    per[k] = s === null ? null : r3(s);
    if (s !== null) { num += WEIGHTS[k] * s; wsum += WEIGHTS[k]; n++; }
  }
  const total = FEATURE_KEYS.reduce((t, k) => t + WEIGHTS[k], 0);
  if (wsum === 0) return { benzerlik: null, alt: null, ust: null, kapsam: 0, ortak: 0, ozellik: per, guven: 'yok' };
  const score = num / wsum;
  const cov = wsum / total;
  return {
    benzerlik: r3(score),
    alt: r3(score * cov),
    ust: r3(score * cov + (1 - cov)),
    kapsam: r3(cov),
    ortak: n,
    ozellik: per,
    guven: n === 4 ? 'yuksek' : n >= 2 ? 'orta' : 'dusuk',
  };
}

/** KABA: Mars, yalnız kuzey 35°K SWIM referansı. Güney yarımküre kontrol edilmedi. */
export function iceDistanceKm(lat: number | null, govde: string): number | null {
  if (govde !== 'mars' || lat === null || lat === undefined) return null;
  return Math.max(0, (ICE_REF_LAT_MARS - lat) * KM_PER_DEG_MARS);
}

export type CostKey = 'termal' | 'su' | 'kalkan' | 'tugla' | 'buz';
export const COST_KEYS: CostKey[] = ['termal', 'su', 'kalkan', 'tugla', 'buz'];

export interface RankInput {
  aday_id: string;
  govde: string;
  kanit_seviyesi: string;
  maliyet: Partial<Record<CostKey, number | null>>;
}
const LEVEL_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

/** Üs uygunluk sıralaması (KABA). Kural: C seviyesi üs adayı sayılmaz (dışarıda);
 *  önce kanıt seviyesi (A > B), sonra temkinli endeks (eksik bileşen 0 sayılır = endeks × kapsam),
 *  sonra endeks. Az verili aday, verisi tam adayın önüne geçemez. */
export function rankSites<T extends RankInput>(cands: T[], body: string, w: Record<CostKey, number>) {
  return cands
    .filter((c) => c.govde === body && c.kanit_seviyesi !== 'C')
    .map((c) => ({ c, ...costIndex(c.maliyet, w) }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.c.kanit_seviyesi] - LEVEL_ORDER[b.c.kanit_seviyesi] ||
        (b.endeks ?? 0) * b.kapsam - (a.endeks ?? 0) * a.kapsam ||
        (b.endeks ?? -1) - (a.endeks ?? -1) ||
        b.kapsam - a.kapsam ||
        a.c.aday_id.localeCompare(b.c.aday_id),
    );
}

/** Ağırlıklı maliyet endeksi; null bileşen atlanır, ağırlık yeniden dağıtılır. */
export function costIndex(c: Partial<Record<CostKey, number | null>>, w: Record<CostKey, number>) {
  let num = 0, ws = 0, wall = 0;
  for (const k of COST_KEYS) {
    wall += w[k];
    const v = c[k];
    if (v === null || v === undefined || w[k] <= 0) continue;
    num += w[k] * v; ws += w[k];
  }
  return { endeks: ws > 0 ? r3(num / ws) : null, kapsam: wall > 0 ? r3(ws / wall) : 0 };
}
