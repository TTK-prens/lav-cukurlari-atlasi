// "Mağara Üssü Görevi" — saf oyun mantığı (DOM yok), tohumlu RNG ile tekrarlanabilir.
// OYUN MODELİDİR, BİLİMSEL TAHMİN DEĞİLDİR: olasılıklar, hasar ve kaynak birimleri soyut
// tasarım seçimleridir. Saha özellikleri (kanıt seviyesi, derinlik, sarkık duvar, açık giriş,
// termal tampon, buz mesafesi, Dünya ikiziyle ortak özellikler) atlas verisinden gelir.

export type Body = 'ay' | 'mars';
export type ActionId = 'verify' | 'scout' | 'rehearse' | 'power' | 'import_shield' | 'sinter' | 'mine_ice' | 'ice_shield' | 'move_in' | 'wait';
export interface Txt { tr: string; en: string }

export interface SiteParams {
  id: string;
  govde: Body;
  level: 'A' | 'B';
  depthMin: number | null;
  overhang: boolean | null;
  opening: boolean | null;
  thermal: boolean | null;
  iceKm: number | null;
  twinName: string | null;
  twinShared: number; // Dünya ikiziyle paylaşılan (benzeyen) özellik sayısı
  unknown: number;    // 4 özellikten verisi olmayan sayısı
}

export interface LogEntry { turn: number; kind: 'action' | 'event' | 'warn' | 'end'; text: Txt }

export interface State {
  site: SiteParams;
  seed: number;
  rng: number;
  turn: number; // 1..MAX_TURNS
  cargo: number;
  power: number;
  water: number;
  shield: number;
  health: number;
  science: number;
  risk: number;
  verified: boolean;
  inTube: boolean;
  rehearsals: number;
  imported: number; // Dünya'dan getirilen toplam kargo birimi (harcanan)
  log: LogEntry[];
  done: boolean;
  outcome: 'win' | 'loss' | null;
}

export const MAX_TURNS = 10;
export const RISK_FLOOR = 10; // ölçek farkı: Dünya provası bunu kaldıramaz
const ICE_SCALE_KM = 3000;

// ---------------------------------------------------------------- RNG (mulberry32)
function next(s: State): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const T = (tr: string, en: string): Txt => ({ tr, en });

export function iceFactor(p: SiteParams) {
  return p.govde === 'mars' && p.iceKm !== null ? Math.max(0, 1 - p.iceKm / ICE_SCALE_KM) : 0;
}

/** Çukura yerleşince sağlanan doğal kalkan (0-1). Derinlik bilinmiyorsa 0 sayılmaz:
 *  belirsiz orta değer (0.5) kullanılır ve ek risk eklenir (bkz. move_in). */
export function shelter(p: SiteParams) {
  const d = p.depthMin === null ? 0.5 : Math.min(1, p.depthMin / 100) * 0.8;
  return Math.min(1, d + (p.overhang ? 0.2 : 0));
}

export function isLunarNight(s: State) {
  // Ay günü ~29,5 Dünya günü: ~2 hafta gündüz, ~2 hafta gece. 1 tur ≈ 1 hafta.
  return s.site.govde === 'ay' && [3, 4, 7, 8].includes(s.turn);
}

export function newGame(site: SiteParams, seed: number): State {
  const s: State = {
    site, seed, rng: seed >>> 0, turn: 1,
    cargo: 100, power: 40, water: 0, shield: 0, health: 100, science: 0,
    risk: clamp(RISK_FLOOR + 12 * site.unknown + (site.level === 'B' ? 10 : 0)),
    verified: site.level === 'A', inTube: false, rehearsals: 0, imported: 0,
    log: [], done: false, outcome: null,
  };
  s.log.push({ turn: 0, kind: 'warn', text: site.level === 'A'
    ? T('Radar kanıtı var: boşluk doğrulama evresi atlandı.', 'Radar evidence exists: void-confirmation phase skipped.')
    : T('B seviyesi aday: yerleşmeden önce boşluğu doğrulamalısın.', 'Level-B candidate: confirm the void before moving in.') });
  return s;
}

export interface ActionInfo { id: ActionId; cost: Txt; ok: boolean; why?: Txt }

export function actions(s: State): ActionInfo[] {
  const p = s.site;
  const ice = iceFactor(p);
  const a: ActionInfo[] = [
    { id: 'verify', cost: T('8 kargo', '8 cargo'), ok: !s.verified && s.cargo >= 8, why: s.verified ? T('zaten doğrulandı', 'already confirmed') : undefined },
    { id: 'scout', cost: T('6 kargo', '6 cargo'), ok: s.cargo >= 6 && s.risk > RISK_FLOOR, why: s.risk <= RISK_FLOOR ? T('kalan risk ölçek farkı: keşifle düşmez', 'remaining risk is the scale gap: scouting cannot lower it') : undefined },
    { id: 'rehearse', cost: T('2 kargo', '2 cargo'), ok: s.cargo >= 2 && s.rehearsals < 2 && p.twinShared > 0 && s.risk > RISK_FLOOR,
      why: p.twinShared === 0 ? T('Dünya ikiziyle ortak özellik yok', 'no feature shared with the Earth twin') : s.rehearsals >= 2 ? T('en fazla 2 prova', 'at most 2 rehearsals') : undefined },
    { id: 'power', cost: T('10 kargo', '10 cargo'), ok: s.cargo >= 10 },
    { id: 'import_shield', cost: T('20 kargo', '20 cargo'), ok: s.cargo >= 20 && s.shield < 100 },
    { id: 'sinter', cost: T('4 kargo + 15 enerji', '4 cargo + 15 power'), ok: s.cargo >= 4 && s.power >= 15 && s.shield < 100, why: s.power < 15 ? T('enerji yetersiz', 'not enough power') : undefined },
    { id: 'mine_ice', cost: T('3 kargo + 10 enerji', '3 cargo + 10 power'), ok: p.govde === 'mars' && ice > 0 && s.cargo >= 3 && s.power >= 10,
      why: p.govde === 'ay' ? T('Ay için kaynaklı buz referansı yok', 'no sourced ice reference for the Moon') : ice === 0 ? T('buz sınırı çok uzak', 'ice limit too far') : s.power < 10 ? T('enerji yetersiz', 'not enough power') : undefined },
    { id: 'ice_shield', cost: T('10 su', '10 water'), ok: s.water >= 10 && s.shield < 100, why: s.water < 10 ? T('en az 10 su gerekir', 'needs at least 10 water') : undefined },
    { id: 'move_in', cost: T('5 kargo', '5 cargo'), ok: !s.inTube && s.verified && p.opening !== false && s.cargo >= 5,
      why: s.inTube ? T('zaten içeride', 'already inside') : !s.verified ? T('önce boşluğu doğrula', 'confirm the void first') : p.opening === false ? T('açık giriş yok', 'no open entrance') : undefined },
    { id: 'wait', cost: T('—', '—'), ok: true },
  ];
  return a;
}

function log(s: State, kind: LogEntry['kind'], text: Txt) { s.log.push({ turn: s.turn, kind, text }); }
function spend(s: State, n: number) { s.cargo -= n; s.imported += n; }

export function play(s0: State, id: ActionId): State {
  const s: State = { ...s0, log: [...s0.log] };
  if (s.done) return s;
  const info = actions(s).find((a) => a.id === id);
  if (!info || !info.ok) return s;
  const p = s.site;
  switch (id) {
    case 'verify':
      spend(s, 8); s.verified = true; s.science += 10;
      log(s, 'action', T('Boşluk doğrulama taraması yapıldı (yer radarı + iniş kamerası).', 'Void-confirmation survey done (ground radar + descent camera).'));
      break;
    case 'scout':
      spend(s, 6); s.risk = clamp(s.risk - 12, RISK_FLOOR); s.science += 8;
      log(s, 'action', T('Keşif robotu skylight\'a indi. Risk düştü; bilinmeyen değerler yine de atlas verisine eklenmez.', 'Scout robot descended the skylight. Risk fell; unknown values are still not added to atlas data.'));
      break;
    case 'rehearse':
      spend(s, 2); s.rehearsals++; s.risk = clamp(s.risk - 6 * p.twinShared, RISK_FLOOR); s.science += 6;
      log(s, 'action', T(`Dünya ikizinde (${p.twinName}) prova: ${p.twinShared} ortak özellik için prosedür riski düştü. Ölçek farkı kalıyor.`, `Rehearsal at the Earth twin (${p.twinName}): procedural risk lowered for ${p.twinShared} shared feature(s). The scale gap remains.`));
      break;
    case 'power':
      spend(s, 10); s.power = clamp(s.power + 30);
      log(s, 'action', T('Güneş paneli ve batarya kuruldu.', 'Solar panels and batteries installed.'));
      break;
    case 'import_shield':
      spend(s, 20); s.shield = clamp(s.shield + 25);
      log(s, 'action', T('Kalkan malzemesi Dünya\'dan getirildi: pahalı.', 'Shielding shipped from Earth: expensive.'));
      break;
    case 'sinter':
      spend(s, 4); s.power -= 15; s.shield = clamp(s.shield + 12);
      log(s, 'action', T('Regolit sinterlenerek tuğla basıldı (yüzey yapısı).', 'Regolith sintered into bricks (surface structure).'));
      break;
    case 'mine_ice': {
      spend(s, 3); s.power -= 10; const got = Math.round(30 * iceFactor(p)); s.water += got;
      log(s, 'action', T(`Buz kazıldı: +${got} su (buz sınırına uzaklık verimi belirler).`, `Ice mined: +${got} water (distance to the ice limit sets the yield).`));
      break;
    }
    case 'ice_shield':
      s.water -= 10; s.shield = clamp(s.shield + 30);
      log(s, 'action', T('Su buzu kalkana döndü: aynı koruma için regolitin üçte biri kalınlık.', 'Water ice turned into shielding: one third the thickness of regolith for the same protection.'));
      break;
    case 'move_in':
      spend(s, 5); s.inTube = true; s.science += 10;
      if (p.depthMin === null) { s.risk = clamp(s.risk + 10); log(s, 'warn', T('Derinlik bilinmiyor: içerideki koruma belirsiz, risk arttı.', 'Depth unknown: shelter inside is uncertain, risk increased.')); }
      log(s, 'action', T('Habitat çukurun içine taşındı.', 'Habitat moved inside the pit.'));
      break;
    case 'wait':
      log(s, 'action', T('Bekle ve gözle.', 'Wait and observe.'));
      break;
  }
  endOfTurn(s);
  return s;
}

function protection(s: State) {
  const tube = s.inTube ? shelter(s.site) : 0;
  return 1 - (1 - s.shield / 100) * (1 - tube);
}

function endOfTurn(s: State) {
  const p = s.site;
  const buffered = s.inTube && p.thermal === true;
  // enerji tüketimi: termal tamponlu çukur içinde daha az
  let use = buffered ? 4 : 10;
  if (isLunarNight(s)) { use += buffered ? 2 : 12; log(s, 'event', T('Ay gecesi (~2 hafta): güneş enerjisi yok, ısıtma yükü arttı.', 'Lunar night (~2 weeks): no solar power, heating load up.')); }
  s.power -= use;
  // yaşam desteği: yerel su yoksa Dünya'dan kargo
  if (s.water >= 3) s.water -= 3; else spend(s, 3);
  // olay
  const prot = protection(s);
  const r = next(s);
  if (r < 0.25) {
    const d = Math.round(30 * (1 - prot)); s.health -= d;
    log(s, 'event', T(`Güneş parçacık olayı: −${d} sağlık (koruma %${Math.round(prot * 100)}).`, `Solar particle event: −${d} health (protection ${Math.round(prot * 100)}%).`));
  } else if (r < 0.25 + (p.govde === 'ay' ? 0.2 : 0.1)) {
    const d = Math.round(12 * (1 - prot)); s.health -= d;
    log(s, 'event', T(`Mikrometeorit: −${d} sağlık.`, `Micrometeorite: −${d} health.`));
  } else if (p.govde === 'mars' && r < 0.55) {
    s.power -= 15;
    log(s, 'event', T('Toz fırtınası: güneş panelleri örtüldü, −15 enerji.', 'Dust storm: panels covered, −15 power.'));
  } else {
    log(s, 'event', T('Sakin evre.', 'Quiet phase.'));
  }
  const surprise = next(s) < s.risk / (s.inTube ? 200 : 400);
  if (surprise) { s.health -= 15; log(s, 'warn', T('Beklenmeyen saha sorunu (bilinmeyen özellik): −15 sağlık.', 'Unexpected site problem (unknown feature): −15 health.')); }
  if (s.power < 0) { s.health -= 12; s.power = 0; log(s, 'warn', T('Enerji bitti: −12 sağlık.', 'Power ran out: −12 health.')); }
  if (s.cargo < 0) { s.health -= 15; s.cargo = 0; log(s, 'warn', T('Kargo bitti: ikmal yok, −15 sağlık.', 'Cargo exhausted: no resupply, −15 health.')); }
  s.health = clamp(s.health); s.power = clamp(s.power); s.shield = clamp(s.shield);
  if (s.health <= 0) { s.done = true; s.outcome = 'loss'; log(s, 'end', T('Görev kaybedildi: mürettebat tahliye edildi.', 'Mission lost: crew evacuated.')); return; }
  if (s.turn >= MAX_TURNS) {
    s.done = true; s.outcome = 'win';
    log(s, 'end', T('Görev süresi tamamlandı.', 'Mission duration completed.'));
    return;
  }
  s.turn++;
}

export function score(s: State) {
  return Math.round(s.health + s.science + s.cargo / 2 + (s.inTube ? 20 : 0) - s.risk / 2);
}

export function grade(s: State): Txt {
  if (s.outcome === 'loss') return T('Görev başarısız', 'Mission failed');
  const sc = score(s);
  if (sc >= 140) return T('Üstün görev', 'Outstanding mission');
  if (sc >= 90) return T('Başarılı görev', 'Successful mission');
  return T('Zor kazanılmış görev', 'Hard-won mission');
}

/** Test ve "otomatik pilot" için makul bir strateji. */
export function sensiblePolicy(s: State): ActionId {
  const ok = new Set(actions(s).filter((a) => a.ok).map((a) => a.id));
  if (ok.has('verify')) return 'verify';
  if (s.power < 25 && ok.has('power')) return 'power';
  if (ok.has('rehearse')) return 'rehearse';
  if (ok.has('move_in')) return 'move_in';
  if (ok.has('mine_ice') && s.water < 10) return 'mine_ice';
  if (ok.has('ice_shield')) return 'ice_shield';
  if (s.shield < 40 && ok.has('sinter')) return 'sinter';
  if (ok.has('scout') && s.risk > RISK_FLOOR + 10) return 'scout';
  if (s.power < 40 && ok.has('power')) return 'power';
  return 'wait';
}

export function runPolicy(site: SiteParams, seed: number, policy: (s: State) => ActionId) {
  let s = newGame(site, seed);
  for (let i = 0; i < 50 && !s.done; i++) s = play(s, policy(s));
  return s;
}

// ---------------------------------------------------------------- atlas verisinden saha
import type { Candidate } from './types';
export function siteFromCandidate(c: Candidate, twinName: (id: string) => string): SiteParams | null {
  if (c.kanit_seviyesi === 'C') return null; // C üs adayı sayılmaz
  const o = c.ozellikler;
  const best = c.ikizler.find((t) => t.benzerlik !== null) ?? null;
  const shared = best ? Object.values(best.ozellik_skor).filter((v) => v !== null && v >= 0.6).length : 0;
  const feats = [o.dD, o.overhang, o.acik_giris, o.termal_tampon];
  return {
    id: c.aday_id,
    govde: c.govde,
    level: c.kanit_seviyesi,
    depthMin: o.derinlik_m_aralik ? o.derinlik_m_aralik[0] : null,
    overhang: o.overhang,
    opening: o.acik_giris,
    thermal: o.termal_tampon,
    iceKm: c.maliyet.buz_mesafe_km,
    twinName: best ? twinName(best.dunya_id) : null,
    twinShared: shared,
    unknown: feats.filter((v) => v === null).length,
  };
}
