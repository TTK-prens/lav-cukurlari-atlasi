import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import raw from '../data/eslesme.json';
import layersRaw from '../data/katmanlar.json';
import imagesRaw from '../data/gorseller.json';
import type { Candidate, Earth, MatchDoc, Source } from './types';
import { compare, costIndex, rankSites, COST_KEYS, FEATURE_KEYS, type CostKey, type FeatureKey, type Features } from './match';
import { getLang, setLang, t, type Key } from './i18n';
import * as G from './game';

const doc = raw as unknown as MatchDoc;
const SRC = new Map<string, Source>(doc.kaynaklar.map((s) => [s.kaynak_id, s]));
const EARTH = new Map<string, Earth>(doc.dunya.map((d) => [d.dunya_id, d]));

type View = 'home' | 'map' | 'compare' | 'rank' | 'cost' | 'game' | 'cross' | 'method' | 'sources';
const S = {
  body: 'mars' as 'mars' | 'ay',
  view: 'home' as View,
  sel: null as string | null,
  twin: 0,
  basemap: 'mola' as 'mola' | 'themis',
  weights: { termal: 1, su: 1, kalkan: 1, tugla: 1, buz: 1 } as Record<CostKey, number>,
  crossA: 'MARS-01',
  crossB: 'AY-01',
};

// ---------------------------------------------------------------- yardımcılar
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const yn = (v: boolean | null) => (v === null ? `<span class="nd">${t('noData')}</span>` : v ? t('yes') : t('no'));
const cand = (id: string | null) => doc.adaylar.find((c) => c.aday_id === id) ?? null;
const fmtRange = (s: string | null) => (s ? s.replace('-', '–') : null);
const EN = () => getLang() === 'en';
const nm = (c: Candidate) => (EN() && c.ad_en ? c.ad_en : c.ad);
const capDef = (c: Candidate) => (EN() && c.ozellikler.cap_tanimi_en ? c.ozellikler.cap_tanimi_en : c.ozellikler.cap_tanimi);
const thNote = (c: Candidate) => (EN() && c.ozellikler.termal_not_en ? c.ozellikler.termal_not_en : c.ozellikler.termal_not);

function srcRefs(ids: (string | null | undefined)[] | string | null | undefined): string {
  const list = (Array.isArray(ids) ? ids : (ids ?? '').split(';')).filter(Boolean) as string[];
  if (!list.length) return '';
  return list
    .map((id) => {
      const s = SRC.get(id.trim());
      const label = esc(id.trim());
      if (!s) return `<span class="src">[${label}]</span>`;
      return s.url
        ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.baslik)}">[${label}]</a>`
        : `<span class="src" title="${esc(s.baslik)}">[${label}]</span>`;
    })
    .join(' ');
}

function levelBadge(l: string) {
  const title = l === 'A' ? t('lvlA') : l === 'B' ? t('lvlB') : t('lvlC');
  return `<span class="lvl lvl-${esc(l)}" title="${esc(title)}" aria-label="${esc(t('level'))} ${esc(l)}">${esc(l)}</span>`;
}

function candFeatures(c: Candidate): Features {
  const o = c.ozellikler;
  return { dD: o.dD, overhang: o.overhang, acik_giris: o.acik_giris, termal: o.termal_tampon };
}
const earthFeatures = (e: Earth): Features => ({ ...e.ozellik });

const FLABEL: Record<FeatureKey, Key> = { dD: 'dD', overhang: 'overhang', acik_giris: 'opening', termal: 'thermal' };

function locText(c: Candidate) {
  if (c.enlem === null || c.boylam === null) return `<span class="nd">${t('noLocation')}</span>`;
  const ns = c.enlem >= 0 ? 'K' : 'G';
  const lat = `${Math.abs(c.enlem).toFixed(3)}°${getLang() === 'en' ? (c.enlem >= 0 ? 'N' : 'S') : ns}`;
  const lon = `${c.boylam.toFixed(3)}°${getLang() === 'en' ? 'E' : 'D'}`;
  const typ = c.konum_tipi === 'goruntu_merkezi' ? ` <em class="warn">(${t('locImg')})</em>` : c.konum_tipi === 'bolge_merkezi' ? ` <em class="warn">(${t('locRegion')})</em>` : '';
  return `${lat}, ${lon}${typ} ${srcRefs(c.kaynak.konum)}`;
}

function depthText(c: Candidate) {
  const d = fmtRange(c.ozellikler.derinlik_m_metin);
  if (!d) return `<span class="nd">${t('noData')}</span>`;
  return `${c.ozellikler.derinlik_tipi === 'en_az' ? t('atLeast') : ''}${d} m`;
}

// ---------------------------------------------------------------- görseller (lisanslı, atıflı)
interface Img { file: string; credit: string; license: string; license_url: string | null; source: string; source_url: string; desc: string; panel?: string; shared?: boolean }
const IMG = imagesRaw as unknown as Record<string, Img>;

function figure(id: string, alt: string, kind: 'photo' | 'sci') {
  const im = IMG[id];
  if (!im) return kind === 'photo' ? `<div class="eimg"><div class="ph">${esc(t('imgMissing'))}</div></div>` : '';
  const lic = im.license_url ? `<a href="${esc(im.license_url)}" target="_blank" rel="noopener">${esc(im.license)}</a>` : esc(im.license);
  const panel = im.panel
    ? `<b>${Lx(`Bu aday: panel ${im.panel.replace('-1', ' (1, sol)').replace('-2', ' (2)')}`, `This candidate: panel ${im.panel.replace('-1', ' (1, left)').replace('-2', ' (2)')}`)}</b> · ${Lx('THEMIS görünür ışık; Arsia Mons\'un 7 skylight adayı', 'THEMIS visible light; the 7 Arsia Mons skylight candidates')} · `
    : '';
  return `<figure class="fig ${kind}">
    <a href="img/${esc(im.file)}" target="_blank" rel="noopener"><img src="img/${esc(im.file)}" alt="${esc(alt)}" loading="lazy"></a>
    <figcaption>${panel}${Lx('Görsel', 'Image')}: ${esc(im.credit)} · ${lic} · <a href="${esc(im.source_url)}" target="_blank" rel="noopener">${esc(im.source)}</a></figcaption>
  </figure>`;
}

function featureCard(c: Candidate) {
  const o = c.ozellikler;
  const dd = o.dD === null ? `<span class="nd">${t('noData')}</span>` : `${o.derinlik_tipi === 'en_az' ? '≥' : ''}${o.dD.toFixed(2)}`;
  return `
  ${figure(c.aday_id, nm(c), 'sci')}
  <dl class="fcard">
    <dt>${t('level')}</dt><dd>${levelBadge(c.kanit_seviyesi)} ${c.govde === 'mars' ? `<small class="warn">${t('marsNote')}</small>` : ''}</dd>
    ${c.sinif === 'karst' ? `<dt>⚠</dt><dd class="warn"><b>${t('karst')}</b></dd>` : ''}
    <dt>${t('location')}</dt><dd>${locText(c)}</dd>
    <dt>${t('diameter')}</dt><dd>${o.cap_m_metin ? `${fmtRange(o.cap_m_metin)} m <small>(${esc(capDef(c))})</small>` : `<span class="nd">${t('noData')}</span>`} ${srcRefs(c.kaynak.olcu)}</dd>
    <dt>${t('depth')}</dt><dd>${depthText(c)} ${o.derinlik_m_metin ? srcRefs(c.kaynak.olcu) : ''}</dd>
    <dt>${t('dD')}</dt><dd>${dd} ${o.dD !== null ? `<small>(${EN() ? 'derived: depth ÷ diameter' : 'türetilmiş: derinlik ÷ çap'})</small>` : ''}</dd>
    <dt>${t('overhang')}</dt><dd>${yn(o.overhang)}</dd>
    <dt>${t('opening')}</dt><dd>${yn(o.acik_giris)}</dd>
    <dt>${t('thermal')}</dt><dd>${yn(o.termal_tampon)} ${o.termal_not ? `<br><small>${esc(thNote(c))}</small> ${srcRefs(c.kaynak.termal)}` : ''}</dd>
    ${c.not ? `<dt class="trnote">${t('noteTr')}</dt><dd class="trnote"><small>${esc(c.not)}</small></dd>` : ''}
  </dl>`;
}

function earthCard(e0: Earth) {
  const e = EN() ? { ...e0, ulke: e0.ulke_en ?? e0.ulke, uzunluk: e0.uzunluk_en ?? e0.uzunluk, boyut: e0.boyut_en ?? e0.boyut, sicaklik: e0.sicaklik_en ?? e0.sicaklik, yas: e0.yas_en ?? e0.yas, buz: e0.buz_en ?? e0.buz, not: e0.not_en ?? e0.not } : e0;
  const f = e.ozellik;
  const nd = `<span class="nd">${t('noData')}</span>`;
  const conf = e.sicaklik_guven && /dusuk/.test(e.sicaklik_guven) ? ` <em class="warn">(${t('conf')}: ${esc(e.sicaklik_guven)})</em>` : '';
  return `
  ${figure(e0.dunya_id, e.ad, 'photo')}
  <dl class="fcard">
    <dt>${t('location')}</dt><dd>${e.enlem !== null ? `${e.enlem.toFixed(3)}, ${e.boylam!.toFixed(3)} <small>(${esc(e.konum_kaynak)})</small>` : `<span class="nd">${t('noLocation')}</span>`}</dd>
    <dt>${t('length')}</dt><dd>${e.uzunluk ? esc(e.uzunluk) : nd}</dd>
    <dt>${t('size')}</dt><dd>${e.boyut ? esc(e.boyut) : nd}</dd>
    <dt>${t('dD')}</dt><dd>${f.dD === null ? nd : `${e.derinlik_tipi === 'en_az' ? '≥' : ''}${f.dD.toFixed(2)}`}</dd>
    <dt>${t('overhang')}</dt><dd>${yn(f.overhang)}</dd>
    <dt>${t('opening')}</dt><dd>${yn(f.acik_giris)}</dd>
    <dt>${t('thermal')}</dt><dd>${yn(f.termal)}</dd>
    <dt>${t('temperature')}</dt><dd>${e.sicaklik ? esc(e.sicaklik) + conf : nd}</dd>
    <dt>${t('ice')}</dt><dd>${e.buz ? esc(e.buz) : nd}</dd>
    <dt>${t('age')}</dt><dd>${e.yas ? esc(e.yas) : nd}</dd>
    ${e.not ? `<dt>${t('noteTr')}</dt><dd><small>${esc(e.not)}</small></dd>` : ''}
    <dt>${t('sources')}</dt><dd>${srcRefs(e.kaynaklar)}</dd>
  </dl>`;
}

function scoreBar(v: number | null, band?: [number, number] | null) {
  if (v === null) return `<span class="nd">${t('noData')}</span>`;
  const b = band ? `<span class="band" style="left:${band[0] * 100}%;width:${(band[1] - band[0]) * 100}%"></span>` : '';
  return `<span class="bar" role="img" aria-label="${(v * 100).toFixed(0)}%">${b}<span class="fill" style="width:${v * 100}%"></span></span> <b>${(v * 100).toFixed(0)}%</b>`;
}

function badge(s: number | null) {
  if (s === null) return `<span class="badge b-unk">? ${t('unknown')}</span>`;
  return s >= 0.6 ? `<span class="badge b-ok">✓ ${t('similar')}</span>` : `<span class="badge b-no">✗ ${t('different')}</span>`;
}

function fval(k: FeatureKey, v: number | boolean | null) {
  if (v === null) return `<span class="nd">${t('noData')}</span>`;
  if (k === 'dD') return (v as number).toFixed(2);
  return v ? t('yes') : t('no');
}

// ---------------------------------------------------------------- açıklama üretici (şablon + veri)
const WHY: Record<FeatureKey, { tr: string; en: string }> = {
  dD: { tr: 'derin ve dar bir şaft biçimi, gökyüzü görüş açısını daraltıp radyasyon ve mikrometeorite karşı geometrik kalkan sağlar', en: 'a deep, narrow shaft narrows the sky view and gives geometric shielding against radiation and micrometeorites' },
  overhang: { tr: 'sarkık duvar, tavanı olan korunaklı bir hacim demektir (kalkan)', en: 'an overhang means a roofed, sheltered volume (shielding)' },
  acik_giris: { tr: 'açık giriş, korunaklı boşluğa erişim yolu sağlar', en: 'an opening provides an access path into the sheltered void' },
  termal: { tr: 'tamponlanmış sıcaklık salınımı termal kontrol enerjisini azaltır (termal kararlılık)', en: 'a buffered temperature swing reduces thermal-control energy (thermal stability)' },
};

function explainParagraph(c: Candidate, e: Earth, res: ReturnType<typeof compare>) {
  const L = getLang();
  const fa = candFeatures(c), fb = earthFeatures(e);
  const ok = FEATURE_KEYS.filter((k) => res.ozellik[k] !== null && res.ozellik[k]! >= 0.6);
  const bad = FEATURE_KEYS.filter((k) => res.ozellik[k] !== null && res.ozellik[k]! < 0.6);
  const miss = FEATURE_KEYS.filter((k) => res.ozellik[k] === null);
  const name = (k: FeatureKey) => t(FLABEL[k]);
  const p: string[] = [];
  if (ok.length)
    p.push(L === 'tr'
      ? `<b>Eşleşen:</b> ${ok.map((k) => `${name(k)} (${fval(k, fa[k])} ↔ ${fval(k, fb[k])}) — ${WHY[k].tr}`).join('; ')}.`
      : `<b>Matching:</b> ${ok.map((k) => `${name(k)} (${fval(k, fa[k])} ↔ ${fval(k, fb[k])}) — ${WHY[k].en}`).join('; ')}.`);
  else p.push(L === 'tr' ? '<b>Eşleşen:</b> eşleşen özellik yok.' : '<b>Matching:</b> no matching feature.');
  if (bad.length)
    p.push(L === 'tr'
      ? `<b>Eşleşmeyen:</b> ${bad.map((k) => `${name(k)} (${fval(k, fa[k])} ↔ ${fval(k, fb[k])})`).join('; ')}.`
      : `<b>Not matching:</b> ${bad.map((k) => `${name(k)} (${fval(k, fa[k])} ↔ ${fval(k, fb[k])})`).join('; ')}.`);
  p.push(t('scaleWarn'));
  const cov = Math.round(res.kapsam * 100);
  p.push(L === 'tr'
    ? `<b>Eksik veri:</b> ${miss.length ? miss.map(name).join(', ') + ' için en az bir tarafta veri yok' : 'yok'}. Skor yalnız ${res.ortak}/4 özelliğe (ağırlığın %${cov}'i) dayanıyor; güven: <b>${t(('conf_' + res.guven) as Key)}</b>. Gerçek benzerlik ${res.alt !== null ? `%${Math.round(res.alt * 100)}–%${Math.round(res.ust! * 100)}` : '—'} bandında olabilir.`
    : `<b>Missing data:</b> ${miss.length ? miss.map(name).join(', ') + ' has no data on at least one side' : 'none'}. The score rests on only ${res.ortak}/4 features (${cov}% of the weight); confidence: <b>${t(('conf_' + res.guven) as Key)}</b>. True similarity may lie within ${res.alt !== null ? `${Math.round(res.alt * 100)}–${Math.round(res.ust! * 100)}%` : '—'}.`);
  const use = L === 'tr' ? e.analog_deney : e.analog_deney_en || e.analog_deney;
  p.push(`<b>${t('analogUse')}</b> ${use ? esc(use) : `<span class="nd">${t('noData')}</span>`}`);
  return p.map((x) => `<p>${x}</p>`).join('');
}

// ---------------------------------------------------------------- harita
const TREK = 'https://trek.nasa.gov/tiles';
const LAYERS = {
  mola: { url: `${TREK}/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, max: 7, att: 'NASA Mars Trek – MGS MOLA (renkli gölgeli)' },
  themis: { url: `${TREK}/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/{z}/{y}/{x}.png`, max: 9, att: 'NASA Mars Trek – THEMIS Day IR 100 m' },
  wac: { url: `${TREK}/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, max: 8, att: 'NASA Moon Trek – LRO WAC' },
};
function trekLayer(kind: keyof typeof LAYERS) {
  const l = LAYERS[kind];
  return L.tileLayer(l.url, { tileSize: 256, maxNativeZoom: l.max, maxZoom: 13, noWrap: true, attribution: l.att, bounds: [[-90, -180], [90, 180]] });
}
function bodyLayer(body: 'mars' | 'ay') {
  return trekLayer(body === 'ay' ? 'wac' : S.basemap);
}

function markerIcon(c: Candidate, active = false) {
  return L.divIcon({
    className: '',
    html: `<span class="mk lvl-${c.kanit_seviyesi}${active ? ' active' : ''}${c.sinif === 'karst' ? ' karst' : ''}">${c.kanit_seviyesi}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

let mainMap: L.Map;
let mainBase: L.TileLayer;
const markers = new Map<string, L.Marker>();

function initMainMap() {
  mainMap = L.map('map', { crs: L.CRS.EPSG4326, center: [0, -120], zoom: 2, minZoom: 1, worldCopyJump: false, maxBounds: [[-95, -200], [95, 200]] });
  mainBase = bodyLayer(S.body).addTo(mainMap);
}

function refreshMainMap() {
  mainMap.removeLayer(mainBase);
  mainBase = bodyLayer(S.body).addTo(mainMap);
  markers.forEach((m) => m.remove());
  markers.clear();
  for (const c of doc.adaylar.filter((c) => c.govde === S.body)) {
    if (c.enlem === null || c.boylam_180 === null) continue;
    const m = L.marker([c.enlem, c.boylam_180], { icon: markerIcon(c, c.aday_id === S.sel), title: `${c.aday_id} ${c.ad} (${c.kanit_seviyesi})`, keyboard: true })
      .addTo(mainMap)
      .on('click', () => select(c.aday_id));
    m.bindTooltip(`${esc(nm(c))} — ${c.kanit_seviyesi}`);
    markers.set(c.aday_id, m);
  }
  $('#basemap').style.display = S.body === 'mars' ? '' : 'none';
  refreshOverlays();
}

// ---------------------------------------------------------------- katmanlar: tüp kanıtları + MGC3
interface Tube { tup_id: string; govde: string; ad: string; enlem: number | null; boylam_180: number | null; konum_notu: string; kanit_turu: string; aciklama_tr: string; aciklama_en: string; kaynak: string[] }
interface Mgc { id: string; lat: number; lon: number; lon180: number; t: string; p: number | null; d: number | null; z: number | null; c: string }
const LAY = layersRaw as unknown as { mgc3: { tip: Record<string, { tr: string; en: string }>; oncelik: Record<string, { tr: string; en: string }>; kayitlar: Mgc[] }; tupler: Tube[] };
const OV = { tubes: true, mgc3: false, mgc3min: 1 };
let tubeLayer: L.LayerGroup | null = null;
let mgcLayer: L.LayerGroup | null = null;
const MGC_COL: Record<string, string> = { '0': '#8fd3ff', '1': '#ff6a2b', '2': '#f3b941', '3': '#8a95a8' };

function refreshOverlays() {
  tubeLayer?.remove(); mgcLayer?.remove();
  tubeLayer = L.layerGroup(); mgcLayer = L.layerGroup();
  if (OV.tubes) for (const tb of LAY.tupler.filter((x) => x.govde === S.body && x.enlem !== null && x.boylam_180 !== null)) {
    L.marker([tb.enlem!, tb.boylam_180!], { icon: L.divIcon({ className: '', html: '<span class="mk tube">≋</span>', iconSize: [26, 26], iconAnchor: [-6, 30] }), title: tb.ad, keyboard: true })
      .bindPopup(`<b>${esc(tb.ad)}</b><br><small>${esc(tb.kanit_turu)} · ${esc(tb.konum_notu)}</small><p>${esc(EN() ? tb.aciklama_en : tb.aciklama_tr)}</p>${srcRefs(tb.kaynak)}`)
      .addTo(tubeLayer);
  }
  if (OV.mgc3 && S.body === 'mars') {
    const rend = L.canvas({ padding: 0.3 });
    for (const m of LAY.mgc3.kayitlar) {
      if (m.p === null) continue;
      if (OV.mgc3min === 1 && m.p !== 1 && m.p !== 0) continue;
      const tip = LAY.mgc3.tip[m.t];
      const pr = LAY.mgc3.oncelik[String(m.p)];
      L.circleMarker([m.lat, m.lon180], { renderer: rend, radius: m.p === 1 ? 4 : 3, color: '#0b0f16', weight: 1, fillColor: MGC_COL[String(m.p)] ?? '#8a95a8', fillOpacity: 0.9 })
        .bindPopup(`<b>MGC3 ${esc(m.id)}</b> <small>(${Lx('aday', 'candidate')})</small><br>${esc(tip ? (EN() ? tip.en : tip.tr) : m.t)}<br><small>${esc(pr ? (EN() ? pr.en : pr.tr) : '')}</small>${m.t === 'APC' && m.d ? `<br>${t('diameter')} ~${m.d} m${m.z ? ` · ${Lx('gölgeden yaklaşık derinlik', 'approx. depth from shadow')} ~${m.z} m` : ''}` : ''}<br><small>${Lx('Katalog notu (EN)', 'Catalog note')}: ${esc(m.c)}</small><br>${srcRefs(['MGC3'])}`)
        .addTo(mgcLayer);
    }
  }
  tubeLayer.addTo(mainMap);
  mgcLayer.addTo(mainMap);
  renderOverlayCtl();
}

function renderOverlayCtl() {
  const el = document.getElementById('overlays');
  if (!el) return;
  const nAll = LAY.mgc3.kayitlar.length;
  const nHi = LAY.mgc3.kayitlar.filter((m) => m.p === 1 || m.p === 0).length;
  el.innerHTML = `<label><input type="checkbox" id="ov-tube" ${OV.tubes ? 'checked' : ''}> ≋ ${Lx('Lav tüpü kanıtları', 'Lava tube evidence')}</label>
    ${S.body === 'mars' ? `<label><input type="checkbox" id="ov-mgc" ${OV.mgc3 ? 'checked' : ''}> MGC3 ${Lx('mağara aday kataloğu', 'cave candidate catalog')}</label>
    ${OV.mgc3 ? `<select id="ov-mgc-min"><option value="1"${OV.mgc3min === 1 ? ' selected' : ''}>${Lx(`Öncelik 0–1 (${nHi})`, `Priority 0–1 (${nHi})`)}</option><option value="3"${OV.mgc3min === 3 ? ' selected' : ''}>${Lx(`Tümü (${nAll})`, `All (${nAll})`)}</option></select>
    <small class="warn">${Lx('Çoğu yanlış alarm; hepsi aday', 'Mostly false positives; all candidates')}</small>
    <span class="mgclegend">${['0', '1', '2', '3'].filter((k) => OV.mgc3min === 3 || k === '0' || k === '1').map((k) => `<i style="background:${MGC_COL[k]}"></i>${k} ${k === '0' ? Lx('HiRISE ile gözlendi', 'seen by HiRISE') : k === '1' ? Lx('yüksek', 'high') : k === '2' ? Lx('orta', 'medium') : Lx('belirsiz', 'ambiguous')}`).join(' ')} · ${Lx('noktaya dokun: ayrıntı', 'tap a dot for details')}</span>` : ''}` : ''}`;
  (document.getElementById('ov-tube') as HTMLInputElement).onchange = (e) => { OV.tubes = (e.target as HTMLInputElement).checked; refreshOverlays(); };
  const mg = document.getElementById('ov-mgc') as HTMLInputElement | null;
  if (mg) mg.onchange = (e) => { OV.mgc3 = (e.target as HTMLInputElement).checked; refreshOverlays(); };
  const mm = document.getElementById('ov-mgc-min') as HTMLSelectElement | null;
  if (mm) mm.onchange = (e) => { OV.mgc3min = Number((e.target as HTMLSelectElement).value); refreshOverlays(); };
}

function select(id: string, fly = true) {
  S.sel = id;
  S.twin = 0;
  const c = cand(id)!;
  if (c.govde !== S.body) { S.body = c.govde; refreshMainMap(); }
  markers.forEach((m, k) => m.setIcon(markerIcon(cand(k)!, k === id)));
  if (fly && c.enlem !== null && c.boylam_180 !== null && S.view === 'map') mainMap.flyTo([c.enlem, c.boylam_180], c.govde === 'mars' ? 6 : 6, { duration: 0.8 });
  render();
}

// ---------------------------------------------------------------- liste & detay
function renderList() {
  const items = doc.adaylar.filter((c) => c.govde === S.body);
  $('#list').innerHTML = `
    <h2>${t('candidates')} <small>(${items.length})</small></h2>
    ${S.body === 'mars' ? `<p class="warn small">${t('marsNote')}</p>` : ''}
    <ul>${items
      .map((c) => `<li><button class="li${c.aday_id === S.sel ? ' on' : ''}" data-id="${c.aday_id}">
        ${levelBadge(c.kanit_seviyesi)} <span class="nm">${esc(nm(c))}</span>
        <small>${esc(c.bolge)}${c.enlem === null ? ` · <em>${t('noCoord')}</em>` : ''}${c.sinif === 'karst' ? ' · KARST' : ''}</small></button></li>`)
      .join('')}</ul>
    <div class="legend"><b>${t('level')}:</b><br>${levelBadge('A')} ${t('lvlA')}<br>${levelBadge('B')} ${t('lvlB')}<br>${levelBadge('C')} ${t('lvlC')}</div>`;
  $('#list').querySelectorAll<HTMLButtonElement>('button.li').forEach((b) => b.addEventListener('click', () => select(b.dataset.id!)));
}

function twinsList(c: Candidate) {
  return `<ol class="twins">${c.ikizler
    .slice(0, 5)
    .map((tw) => {
      const e = EARTH.get(tw.dunya_id)!;
      return `<li><b>${esc(e.ad)}</b> <small>${esc(e.ulke)}</small><br>
        ${tw.benzerlik === null ? `<span class="nd">${t('notRanked')}</span>` : `<b>${Math.round(tw.bant![0] * 100)}–${Math.round(tw.bant![1] * 100)}%</b> ${scoreBar(tw.benzerlik, tw.bant)} <small>${t('band')} · ${tw.ortak_ozellik}/4 · ${t('conf')}: ${t(('conf_' + tw.guven) as Key)}</small>`}</li>`;
    })
    .join('')}</ol>`;
}

function costPanel(c: Candidate) {
  const m = c.maliyet;
  const ci = costIndex(m, S.weights);
  const q = ci.endeks === null ? t('massNone') : ci.endeks >= 0.7 ? t('massHigh') : ci.endeks >= 0.4 ? t('massMid') : t('massLow');
  return `
  <section class="cost">
    <h3>${t('cost')} <span class="rough">${t('rough')}</span></h3>
    <div class="big">${ci.endeks === null ? `<span class="nd">${t('noData')}</span>` : scoreBar(ci.endeks)} <small>${t('coverage')} ${Math.round(ci.kapsam * 100)}%</small></div>
    <p class="small"><b>${t('massQual')}:</b> ${q}</p>
    <table class="ctab">
      ${COST_KEYS.map((k) => `<tr><th>${t(('c_' + k) as Key)}</th><td>${m[k] === null ? `<span class="nd">${t('noData')}</span>` : scoreBar(m[k])}</td>
        <td><label class="sr" for="w-${k}">${t('weights')} ${t(('c_' + k) as Key)}</label><input type="range" id="w-${k}" data-k="${k}" min="0" max="3" step="0.5" value="${S.weights[k]}"> <small>×${S.weights[k]}</small></td></tr>`).join('')}
    </table>
    ${m.buz_mesafe_km !== null ? `<p class="small">${t('iceDist')}: <b>~${m.buz_mesafe_km.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US')} km</b> <span class="rough">${t('rough')}</span> — ${t('iceDistNote')} ${srcRefs(['SWIM'])}</p>` : ''}
    ${c.govde === 'mars' && c.enlem !== null && c.enlem < 0 ? `<p class="small warn">${getLang() === 'tr' ? 'Güney yarımküre: buz referansı kontrol edilmedi.' : 'Southern hemisphere: ice reference not checked.'}</p>` : ''}
    ${c.govde === 'ay' ? `<p class="small warn">${getLang() === 'tr' ? 'Ay için su/buz bileşeni henüz kaynaklı bir referansla hesaplanmadı (veri yok). Bu yüzden Ay endeksi Mars endeksiyle doğrudan karşılaştırılamaz.' : 'Moon water/ice component not yet computed from a sourced reference (no data). The Moon index is therefore NOT directly comparable to the Mars index.'}</p>` : ''}
  </section>`;
}

function isruCards(c: Candidate) {
  const tr = getLang() === 'tr';
  return `<section class="cards">
    <div class="card"><h4>${t('isruTitle')}</h4><ul class="small">
      <li>${tr ? "Mars yüzeyinde tasarruf edilen her 1 kg iniş kütlesi ≈ LEO'da 10,5–17 kg tasarruf" : 'Every 1 kg saved on the Mars surface ≈ 10.5–17 kg saved in LEO'} ${srcRefs(['NTRS-20160006324'])}</li>
      <li>${tr ? "Ay/Mars'ta üretilen her 1 kg itici gaz ≈ LEO'da 7,4–11,3 kg tasarruf (itici gaz, iniş kütlesi değil)" : 'Every 1 kg of propellant made on the Moon/Mars ≈ 7.4–11.3 kg saved in LEO (propellant, not landed mass)'} ${srcRefs(['NTRS-20180002086'])}</li>
      ${c.govde === 'mars' ? `<li>${tr ? 'Radyasyon kalkanı (50 mSv/yıl): su buzu 325 mm ≈ regolit 975 mm' : 'Radiation shield (50 mSv/yr): water ice 325 mm ≈ regolith 975 mm'} ${srcRefs(['ICE-SHIELD'])}</li>` : `<li>${tr ? 'Simüle Ay toprağı + MgO ile 1,5 t blok basıldı (yüzey 3D baskı; çukur içi değil, tamamlayıcı strateji)' : '1.5 t block printed from simulated lunar soil + MgO (surface 3D printing; not inside pits — complementary strategy)'} ${srcRefs(['ESA-3DPRINT'])}</li>`}
    </ul></div>
    <div class="card"><h4>${t('challenges')}</h4><ul class="small">
      ${c.govde === 'ay' ? `<li>${tr ? 'Ay tozu elektrostatik olarak yapışır: ekipman ve sağlık riski' : 'Lunar dust clings electrostatically: equipment and health risk'} ${srcRefs(['TAKIM-NOTU'])}</li>
      <li>${tr ? 'Yüzey: gündüz >121 °C, gece −133 °C; yalnız ekzosfer' : 'Surface: >121 °C by day, −133 °C at night; exosphere only'} ${srcRefs(['NASA-WEATHER'])}</li>`
      : `<li>${tr ? 'Mars mağara sıcaklığı için mutlak değer yayımlanmamış; yalnız günlük salınımın çevreye göre küçük olduğu biliniyor' : 'No absolute Mars cave temperature is published; only that the diurnal swing is small relative to surroundings'} ${srcRefs(['CUSHING2007'])}</li>
      <li>${tr ? 'Dünya mağaraları yerel yıllık ortalama sıcaklığı izler → Mars mağaraları Mare Tranquillitatis çukurunun gölgeli tabanından (~17 °C) çok daha soğuk olur' : 'Earth caves track local mean annual temperature → Mars caves would be far colder than the shaded floor of the Mare Tranquillitatis pit (~17 °C)'}</li>`}
      <li>${tr ? 'Buz kalıcı olmayabilir: Lava Beds mağara buzu sıcaklık salınımıyla eriyor' : 'Ice may not be permanent: Lava Beds cave ice is melting with temperature swings'} ${srcRefs(['EOS-LAVABEDS'])}</li>
    </ul></div></section>`;
}

function bindSliders(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((i) =>
    i.addEventListener('input', () => { S.weights[i.dataset.k as CostKey] = Number(i.value); render(); }),
  );
}

function renderDetail() {
  const c = cand(S.sel);
  const el = $('#detail');
  if (!c || c.govde !== S.body) { el.innerHTML = `<p class="hint">${t('pickCandidate')}</p>`; return; }
  el.innerHTML = `
    <h2>${levelBadge(c.kanit_seviyesi)} ${esc(nm(c))} <small>${esc(c.aday_id)}</small></h2>
    <button class="primary" id="go-compare">${t('openCompare')}</button>
    ${featureCard(c)}
    <h3>${t('twins')}</h3>
    <p class="small warn">${t('scaleWarn')}</p>
    ${twinsList(c)}
    ${costPanel(c)}
    ${isruCards(c)}`;
  $('#go-compare').addEventListener('click', () => { location.hash = '#/karsilastir'; });
  bindSliders(el);
}

// ---------------------------------------------------------------- üçlü karşılaştırma
let cmpMaps: L.Map[] = [];
function renderCompare() {
  cmpMaps.forEach((m) => m.remove());
  cmpMaps = [];
  const el = $('#compare');
  const c = cand(S.sel);
  if (!c) { el.innerHTML = `<p class="hint">${t('pickCandidate')}</p>`; return; }
  const ranked = c.ikizler.filter((x) => x.benzerlik !== null);
  const isRanked = ranked.length > 0;
  const top = (isRanked ? ranked : c.ikizler).slice(0, 3);
  const tw = top[Math.min(S.twin, top.length - 1)];
  const e = tw ? EARTH.get(tw.dunya_id)! : null;
  const res = e && isRanked ? compare(candFeatures(c), earthFeatures(e)) : null;
  const tied = isRanked ? ranked.filter((x) => x.bant![0] === ranked[0].bant![0] && x.benzerlik === ranked[0].benzerlik).length : 0;
  el.innerHTML = `
  <div class="cmp">
    <section class="col">
      <h2>${levelBadge(c.kanit_seviyesi)} ${esc(nm(c))} <small>${c.govde === 'mars' ? t('mars') : t('moon')}</small></h2>
      <div id="cmp-map-a" class="mini"></div>
      ${featureCard(c)}
    </section>
    <section class="col">
      <h2>${isRanked ? `${t('bestTwin')}${e ? `: ${esc(e.ad)}` : ''}` : `${EN() ? 'Same-class Earth record (NOT ranked)' : 'Aynı sınıftan Dünya kaydı (SIRALANMADI)'}${e ? `: ${esc(e.ad)}` : ''}`}</h2>
      ${!isRanked ? `<p class="warn small">${t('notRanked')}. ${EN() ? 'No feature is known on both sides, so no similarity can be computed. Shown only for class context.' : 'İki tarafta da bilinen ortak özellik olmadığı için benzerlik hesaplanamaz. Yalnız sınıf bağlamı için gösterilir.'}</p>` : ''}
      ${tied > 1 ? `<p class="small warn">${EN() ? `${tied} Earth records tie on the known features. Earth pit dimensions (d/D) and overhang data are missing, so the ranking cannot separate them.` : `${tied} Dünya kaydı bilinen özelliklerde eşit. Dünya çukur ölçüleri (d/D) ve sarkık duvar verisi eksik olduğu için sıralama bunları ayıramıyor.`}</p>` : ''}
      <div class="tabs" role="tablist">${top.map((x, i) => `<button role="tab" aria-selected="${i === S.twin}" class="${i === S.twin ? 'on' : ''}" data-i="${i}">${isRanked ? t('twinN') : EN() ? 'Record' : 'Kayıt'} ${i + 1}: ${esc(EARTH.get(x.dunya_id)!.ad)}</button>`).join('')}</div>
      <div id="cmp-map-b" class="mini"></div>
      <p class="small">${t('earthMapNote')}</p>
      ${e ? earthCard(e) : `<p class="nd">${t('noData')}</p>`}
    </section>
    <section class="col">
      <h2>${t('why')}</h2>
      ${res && tw ? `
        <div class="big">${t('score')} (${t('band')}): <b>${res.alt !== null ? `${Math.round(res.alt * 100)}–${Math.round(res.ust! * 100)}%` : '—'}</b> ${scoreBar(res.benzerlik, res.alt !== null ? [res.alt, res.ust!] : null)}
          <br><small>${EN() ? `${Math.round((res.benzerlik ?? 0) * 100)}% on the ${res.ortak}/4 shared features only` : `yalnız ${res.ortak}/4 ortak özellikte %${Math.round((res.benzerlik ?? 0) * 100)}`} · ${t('conf')}: ${t(('conf_' + res.guven) as Key)}</small></div>
        <table class="ftab"><thead><tr><th>${t('feature')}</th><th>${esc(nm(c))}</th><th>${esc(e!.ad)}</th><th>${t('score')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${FEATURE_KEYS.map((k) => `<tr><th>${t(FLABEL[k])}</th><td>${fval(k, candFeatures(c)[k])}</td><td>${fval(k, earthFeatures(e!)[k])}</td><td>${scoreBar(res.ozellik[k])}</td><td>${badge(res.ozellik[k])}</td></tr>`).join('')}
        <tr><th>${t('diameter')}</th><td>${c.ozellikler.cap_m_metin ? fmtRange(c.ozellikler.cap_m_metin) + ' m' : t('noData')}</td><td>${e!.cap_m ? fmtRange(e!.cap_m) + ' m' : e!.gecit_genislik_m ? fmtRange(e!.gecit_genislik_m) + ' m*' : t('noData')}</td><td colspan="2"><small>${getLang() === 'tr' ? 'skora dahil değil (ölçek)' : 'not scored (scale)'}</small></td></tr>
        </tbody></table>
        <p class="small">* ${getLang() === 'tr' ? 'Dünya için çukur çapı yoksa geçit genişliği gösterilir; aynı büyüklük değildir.' : 'If no pit diameter exists for Earth, passage width is shown; not the same quantity.'}</p>
        <h3>${t('explanation')}</h3><div class="expl">${explainParagraph(c, e!, res)}</div>`
      : `<p class="nd">${t('notRanked')}</p><table class="ftab"><tbody>${e ? FEATURE_KEYS.map((k) => `<tr><th>${t(FLABEL[k])}</th><td>${fval(k, candFeatures(c)[k])}</td><td>${fval(k, earthFeatures(e)[k])}</td><td>${badge(null)}</td></tr>`).join('') : ''}</tbody></table>`}
    </section>
  </div>
  <div class="cmp-bottom">${costPanel(c)}${isruCards(c)}</div>`;
  el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => { S.twin = Number(b.dataset.i); renderCompare(); }));
  bindSliders(el.querySelector('.cmp-bottom') as HTMLElement);

  // sol: Trek
  const a = L.map('cmp-map-a', { crs: L.CRS.EPSG4326, zoomControl: true, attributionControl: true });
  trekLayer(c.govde === 'ay' ? 'wac' : 'themis').addTo(a);
  if (c.enlem !== null && c.boylam_180 !== null) {
    a.setView([c.enlem, c.boylam_180], 7);
    L.marker([c.enlem, c.boylam_180], { icon: markerIcon(c, true) }).addTo(a);
  } else a.setView([0, 0], 1);
  cmpMaps.push(a);
  // orta: OSM
  const b = L.map('cmp-map-b');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(b);
  if (e && e.enlem !== null && e.boylam !== null) {
    b.setView([e.enlem, e.boylam], 9);
    L.marker([e.enlem, e.boylam], { icon: L.divIcon({ className: '', html: '<span class="mk earth">⊕</span>', iconSize: [24, 24], iconAnchor: [12, 12] }), title: e.ad }).addTo(b);
  } else b.setView([20, 0], 1);
  cmpMaps.push(b);
}

// ---------------------------------------------------------------- Ay ↔ Mars çapraz
function renderCross() {
  const el = $('#cross');
  const opts = (sel: string) => doc.adaylar.map((c) => `<option value="${c.aday_id}"${c.aday_id === sel ? ' selected' : ''}>${c.govde === 'mars' ? 'Mars' : t('moon')} · ${c.kanit_seviyesi} · ${esc(nm(c))}</option>`).join('');
  const A = cand(S.crossA)!, B = cand(S.crossB)!;
  const res = compare(candFeatures(A), candFeatures(B));
  const classOk = A.sinif === B.sinif;
  el.innerHTML = `
  <div class="cross">
    <label>${t('crossA')} <select id="xa">${opts(S.crossA)}</select></label>
    <label>${t('crossB')} <select id="xb">${opts(S.crossB)}</select></label>
    ${!classOk ? `<p class="warn">${getLang() === 'tr' ? 'Sınıflar farklı (lav ↔ karst): eşleştirme anlamlı değil.' : 'Different classes (lava ↔ karst): matching is not meaningful.'}</p>` : ''}
    <div class="big">${t('score')}: ${scoreBar(res.benzerlik, res.alt !== null ? [res.alt, res.ust!] : null)} <small>${t('conf')}: ${t(('conf_' + res.guven) as Key)}</small></div>
    <table class="ftab"><thead><tr><th>${t('feature')}</th><th>${esc(nm(A))}</th><th>${esc(nm(B))}</th><th>${t('score')}</th><th>${t('status')}</th></tr></thead><tbody>
      <tr><th>${t('level')}</th><td>${levelBadge(A.kanit_seviyesi)}</td><td>${levelBadge(B.kanit_seviyesi)}</td><td colspan="2"></td></tr>
      ${FEATURE_KEYS.map((k) => `<tr><th>${t(FLABEL[k])}</th><td>${fval(k, candFeatures(A)[k])}</td><td>${fval(k, candFeatures(B)[k])}</td><td>${scoreBar(res.ozellik[k])}</td><td>${badge(res.ozellik[k])}</td></tr>`).join('')}
      <tr><th>${t('diameter')}</th><td>${A.ozellikler.cap_m_metin ? fmtRange(A.ozellikler.cap_m_metin) + ' m' : t('noData')}</td><td>${B.ozellikler.cap_m_metin ? fmtRange(B.ozellikler.cap_m_metin) + ' m' : t('noData')}</td><td colspan="2"><small>${getLang() === 'tr' ? 'skora dahil değil' : 'not scored'}</small></td></tr>
      <tr><th>${t('depth')}</th><td>${depthText(A)}</td><td>${depthText(B)}</td><td colspan="2"></td></tr>
      <tr><th>${t('thermalNote')}</th><td><small>${esc(thNote(A)) || t('noData')}</small></td><td><small>${esc(thNote(B)) || t('noData')}</small></td><td colspan="2"></td></tr>
    </tbody></table>
    <p class="small">${getLang() === 'tr' ? 'd/D notu: Ay için iç çukur çapı (LROC Atlas), Mars için kenar çapı kullanılır; Mars derinlikleri çoğunlukla alt sınırdır (≥).' : 'd/D note: inner pit diameter (LROC Atlas) is used for the Moon, rim diameter for Mars; Mars depths are mostly lower bounds (≥).'}</p>
  </div>`;
  ($('#xa') as HTMLSelectElement).addEventListener('change', (ev) => { S.crossA = (ev.target as HTMLSelectElement).value; renderCross(); });
  ($('#xb') as HTMLSelectElement).addEventListener('change', (ev) => { S.crossB = (ev.target as HTMLSelectElement).value; renderCross(); });
}

// ---------------------------------------------------------------- metodoloji & kaynaklar
function renderMethod() {
  const tr = getLang() === 'tr';
  $('#method').innerHTML = `<article class="doc">
  <h2>${t('vMethod')}</h2>
  <h3>${tr ? '1. Kanıt seviyeleri' : '1. Evidence levels'}</h3>
  <p>${levelBadge('A')} ${t('lvlA')}<br>${levelBadge('B')} ${t('lvlB')}<br>${levelBadge('C')} ${t('lvlC')}</p>
  <p>${tr ? 'Mars: A seviyesinde aday yok. Ay: Mare Tranquillitatis çukuru A (Mini-RF radar yeniden analizi, Carrer ve ark. 2024); LROC Atlas\'ta sarkık duvarı "Y" olanlar B, diğerleri C.' : 'Mars: no level-A candidate. Moon: Mare Tranquillitatis pit is A (Mini-RF radar reanalysis, Carrer et al. 2024); LROC Atlas pits with overhang "Y" are B, others C.'} ${srcRefs(['CARRER2024', 'LROC-ATLAS'])}</p>
  <h3>${tr ? '2. Benzerlik' : '2. Similarity'}</h3>
  <p>${tr ? 'Sınıf eşleşmesi zorunludur (lav ↔ lav, karst ↔ karst). Boyut skora girmez; √g ölçeklemesi kullanılmaz.' : 'Class match is mandatory (lava ↔ lava, karst ↔ karst). Size is not scored; no √g scaling is used.'}</p>
  <pre>s_dD = max(0, 1 − |ln(dD_a / dD_b)| / ln 4)
s_overhang, s_açık_giriş, s_termal = 1 (aynı) | 0 (farklı)
w = { dD: 0.35, overhang: 0.20, açık_giriş: 0.15, termal: 0.30 }
skor  = Σ w_i s_i / Σ w_i     (yalnız iki tarafta da veri olan özellikler)
kapsam = Σ w_i(ortak) / Σ w_i(tümü)
bant  = [skor·kapsam , skor·kapsam + (1 − kapsam)]
sıralama: bandın alt sınırı (eşitlikte kaynak güveni)</pre>
  <p>${tr ? 'Güven: 4 ortak özellik = yüksek, 2–3 = orta, 1 = düşük, 0 = sıralanmaz ("veri yok"). d/D: Ay için iç çukur çapı, Mars için kenar çapı; Mars derinlikleri alt sınırdır.' : 'Confidence: 4 shared features = high, 2–3 = medium, 1 = low, 0 = not ranked ("no data"). d/D: inner pit diameter for the Moon, rim diameter for Mars; Mars depths are lower bounds.'}</p>
  <h3>${tr ? '3. Maliyet endeksi' : '3. Cost index'} <span class="rough">${t('rough')}</span></h3>
  <pre>termal = 1 if termal tampon kanıtı (THEMIS / Diviner), aksi halde veri yok
mesafe_km ≈ max(0, (35 − enlem) × 59,2)    (Mars, yalnız kuzey 35°K SWIM referansı)
su  = max(0, 1 − mesafe_km / 3000)
buz = su
kalkan = min(1, derinlik_alt / 100 m) × 0.8 + 0.2 × [overhang]
tuğla = 1 (lav sınıfı: yerel bazaltik regolit; adaylar arasında ayrım yapmaz)
endeks = Σ w_k c_k / Σ w_k   (null bileşen atlanır; w kullanıcı kaydırıcısı)</pre>
  <p>${tr ? 'Örnek: Elysium çukuru (23,21°K) → ~698 km; Dena (−6,31°) → ~2.446 km. Dünya\'dan taşınacak kütle için tonaj hesaplanmaz; yalnız nitel ifade kullanılır.' : 'Example: Elysium pit (23.21°N) → ~698 km; Dena (−6.31°) → ~2,446 km. No tonnage is computed for mass launched from Earth; only qualitative wording.'}</p>
  <h3>${tr ? '4. Termal' : '4. Thermal'}</h3>
  <p>${tr ? 'Ay: yalnız Mare Tranquillitatis çukurunun gölgeli tabanı için ~17 °C (Horvath ve ark. 2022). Mars: mutlak mağara sıcaklığı yayımlanmamıştır; yalnız "günlük salınım çevreye göre küçük" denir (Cushing ve ark. 2007). Dünya mağaraları yerel yıllık ortalamayı izlediği için Mars mağaraları çok daha soğuk olur.' : 'Moon: ~17 °C only for the shaded floor of the Mare Tranquillitatis pit (Horvath et al. 2022). Mars: no absolute cave temperature is published; only "diurnal swing small relative to surroundings" (Cushing et al. 2007). Since Earth caves track local mean annual temperature, Mars caves would be much colder.'} ${srcRefs(['HORVATH2022', 'CUSHING2007'])}</p>
  <h3>${t('demo')} (≈60 s)</h3>
  <ol><li>${tr ? 'Mars haritası → Arsia Mons → "Dena" (B) seç.' : 'Mars map → Arsia Mons → select "Dena" (B).'}</li>
  <li>${tr ? '"Karşılaştır" → sol: Trek konumu, orta: en iyi Dünya ikizi, sağ: özellik tablosu ve rozetler.' : '"Compare" → left: Trek location, middle: best Earth twin, right: feature table and badges.'}</li>
  <li>${tr ? 'Güven bandını ve ölçek uyarısını göster; İkiz 2/3\'e geç.' : 'Show confidence band and scale warning; switch to Twin 2/3.'}</li>
  <li>${tr ? 'Maliyet kaydırıcılarını oynat; Elysium çukuru ile buz mesafesini karşılaştır.' : 'Move cost sliders; compare ice distance with the Elysium pit.'}</li>
  <li>${tr ? '"Ay ↔ Mars": Dena vs. Mare Tranquillitatis çukuru.' : '"Moon ↔ Mars": Dena vs. Mare Tranquillitatis pit.'}</li></ol>
  </article>`;
}

function renderSources() {
  $('#sources').innerHTML = `<article class="doc"><h2>${t('vSources')}</h2>
  <table class="stab"><thead><tr><th>ID</th><th>${getLang() === 'tr' ? 'Kaynak' : 'Source'}</th><th>${getLang() === 'tr' ? 'Tür' : 'Type'}</th><th>${t('conf')}</th><th>${getLang() === 'tr' ? 'Doğrulama notu' : 'Verification note'}</th></tr></thead>
  <tbody>${doc.kaynaklar.map((s) => `<tr id="src-${esc(s.kaynak_id)}"><td><code>${esc(s.kaynak_id)}</code></td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.baslik)}</a>` : esc(s.baslik)}</td><td>${esc(s.tur)}</td><td>${esc(s.guven)}</td><td><small>${esc(s.dogrulama)}</small></td></tr>`).join('')}</tbody></table></article>`;
}


// ---------------------------------------------------------------- yeni sayfalar
const Lx = (tr: string, en: string) => (EN() ? en : tr);
const kmFmt = (n: number) => Math.round(n).toLocaleString(EN() ? 'en-US' : 'tr-TR');

function siteReasons(c: Candidate): string[] {
  const r: string[] = [];
  const o = c.ozellikler;
  if (c.kanit_seviyesi === 'A') r.push(Lx('Radar ile boşluk kanıtı (Carrer ve ark. 2024)', 'Radar evidence of a void (Carrer et al. 2024)'));
  if (o.overhang) r.push(Lx('Sarkık duvar gözlenmiş: tavanlı korunaklı hacim', 'Overhang observed: roofed sheltered volume'));
  if (o.termal_tampon) r.push(c.govde === 'ay' && (o.termal_not ?? '').includes('17 °C') ? Lx('Termal kararlılık: gölgeli taban ~17 °C (Diviner)', 'Thermal stability: shaded floor ~17 °C (Diviner)') : c.govde === 'ay' ? Lx('Termal kararlılık işareti (Diviner); sıcaklık değeri yok', 'Thermal-stability signal (Diviner); no temperature value') : Lx('Termal tampon: günlük salınım çevreye göre küçük (THEMIS)', 'Thermal buffering: diurnal swing small vs. surroundings (THEMIS)'));
  if (o.derinlik_m_metin) r.push(Lx(`Derinlik ${o.derinlik_tipi === 'en_az' ? '≥' : ''}${fmtRange(o.derinlik_m_metin)} m`, `Depth ${o.derinlik_tipi === 'en_az' ? '≥' : ''}${fmtRange(o.derinlik_m_metin)} m`));
  if (c.maliyet.buz_mesafe_km !== null) r.push(Lx(`Buz sınırına ~${kmFmt(c.maliyet.buz_mesafe_km)} km (kaba)`, `~${kmFmt(c.maliyet.buz_mesafe_km)} km to mapped ice (rough)`));
  return r;
}

function miniBars(c: Candidate) {
  return `<div class="minibars">${COST_KEYS.filter((k) => k !== 'buz').map((k) => {
    const v = c.maliyet[k];
    return `<div class="mb"><span>${t(('c_' + k) as Key).split(' (')[0]}</span>${v === null ? `<em class="nd">${t('noData')}</em>` : `<i style="--v:${v}"></i><b>${Math.round(v * 100)}</b>`}</div>`;
  }).join('')}</div>`;
}

function goCompare(id: string) {
  select(id, false);
  location.hash = '#/karsilastir';
}

function renderHome() {
  const marsTop = rankSites(doc.adaylar, 'mars', S.weights)[0];
  const moonTop = rankSites(doc.adaylar, 'ay', S.weights)[0];
  const marsB = doc.adaylar.filter((c) => c.govde === 'mars' && c.kanit_seviyesi === 'B' && c.maliyet.buz_mesafe_km !== null);
  const nearest = [...marsB].sort((a, b) => a.maliyet.buz_mesafe_km! - b.maliyet.buz_mesafe_km!)[0];
  const arsia = marsB.filter((c) => c.bolge === 'Arsia Mons').map((c) => c.maliyet.buz_mesafe_km!);
  const nMars = doc.adaylar.filter((c) => c.govde === 'mars').length;
  const nMoon = doc.adaylar.filter((c) => c.govde === 'ay').length;
  const steps = [
    { n: '01', h: Lx('Aday seç', 'Pick a candidate'), p: Lx('Atlas\'ta Ay veya Mars\'ı seç; harita NASA Trek görüntüsüdür. Harf = kanıt seviyesi.', 'Choose Moon or Mars in the Atlas; the map is NASA Trek imagery. Letter = evidence level.'), href: '#/atlas' },
    { n: '02', h: Lx('Dünya ikizini gör', 'Meet the Earth twin'), p: Lx('Karşılaştır ekranı en benzer Dünya lav tüpünü gösterir.', 'The Compare view shows the most similar Earth lava tube.'), href: '#/karsilastir' },
    { n: '03', h: Lx('Neden benziyor, nerede değil', 'Why similar, where not'), p: Lx('Özellik özellik tablo, güven bandı ve ölçek uyarısı.', 'Feature-by-feature table, confidence band and scale warning.'), href: '#/karsilastir' },
    { n: '04', h: Lx('Maliyet ve sıralama', 'Cost and ranking'), p: Lx('Yerel buz, regolit ve termal kararlılıkla en uygun üs yerleri.', 'Best base sites by local ice, regolith and thermal stability.'), href: '#/siralama' },
  ];
  const topCard = (r: ReturnType<typeof rankSites<Candidate>>[number] | undefined, body: string) =>
    r ? `<article class="clay find">
      <p class="eyebrow">${body} · ${Lx('1. sıradaki üs yeri', '#1 base site')}</p>
      <h3>${levelBadge(r.c.kanit_seviyesi)} ${esc(nm(r.c))}</h3>
      <p class="muted">${esc(r.c.bolge)}</p>
      <ul>${siteReasons(r.c).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn small" data-go="${r.c.aday_id}">${Lx('Dünya ikiziyle karşılaştır →', 'Compare with Earth twin →')}</button>
    </article>` : '';
  $('#home').innerHTML = `
  <section class="hero">
    <div id="hero-map" aria-hidden="true"></div>
    <div class="hero-fade"></div>
    <div class="hero-inner">
      <div class="hero-card glass">
        <p class="eyebrow">NASA Space Apps Challenge 2026</p>
        <h1 class="display">${Lx('Ay\'da ve Mars\'ta ilk üs,<br><em>bir lav çukurunun içinde</em> kurulabilir.', 'The first base on the Moon and Mars<br>could be built <em>inside a lava pit</em>.')}</h1>
        <p class="lead">${Lx(
          'Bu atlas, Ay ve Mars\'taki lav çukuru ve skylight adaylarını NASA haritaları üzerinde gösterir. Her adayı Dünya\'daki lav tüpleriyle özellik özellik eşleştirir: hangi özelliği benziyor, hangisi benzemiyor. Sonra yerel buz, regolit ve termal kararlılıkla üs maliyetini nasıl düşürebileceğimizi puanlar. Bilinmeyen değer uydurulmaz; her sayının kaynağı vardır.',
          'This atlas maps lava-pit and skylight candidates on the Moon and Mars over NASA imagery. It matches each one, feature by feature, with lava tubes on Earth: what is similar and what is not. Then it scores how local ice, regolith and thermal stability could cut base cost. Unknown values are never invented; every number has a source.')}</p>
        <div class="cta">
          <button class="btn primary" data-tour>▶ ${Lx('60 sn jüri turu', '60-second jury tour')}</button>
          <a class="btn ghost" href="#/atlas">${Lx('Atlası keşfet', 'Explore the atlas')}</a>
          <a class="btn ghost" href="#/siralama">${Lx('En uygun üs yerleri', 'Best base sites')}</a>
          <a class="btn ghost" href="#/maliyet">${Lx('Maliyeti nasıl düşürürüz?', 'How do we cut cost?')}</a>
        </div>
      </div>
    </div>
    <p class="credit">${Lx('Arka plan: NASA Mars Trek, THEMIS Day IR mozaiği, Arsia Mons yamacı', 'Background: NASA Mars Trek, THEMIS Day IR mosaic, Arsia Mons flank')}</p>
  </section>

  <section class="band stats">
    <div class="clay stat"><b>${nMars}</b><span>${Lx('Mars aday çukuru', 'Mars pit candidates')}</span><small>HiRISE · THEMIS · Sharma 2025</small></div>
    <div class="clay stat"><b>${nMoon}</b><span>${Lx('Ay mare çukuru', 'lunar mare pits')}</span><small>LROC Pits Atlas</small></div>
    <div class="clay stat"><b>${doc.dunya.length}</b><span>${Lx('Dünya analog sahası', 'Earth analog sites')}</span><small>USGS · NPS · ${Lx('yayınlar', 'papers')}</small></div>
    <div class="clay stat"><b>~17 °C</b><span>${Lx('Mare Tranquillitatis çukuru gölgeli tabanı', 'Mare Tranquillitatis pit, shaded floor')}</span><small>Diviner · Horvath 2022</small></div>
    <div class="clay stat warnstat"><b>0</b><span>${Lx('doğrulanmış Mars mağarası', 'confirmed Mars caves')}</span><small>${Lx('hepsi aday', 'all are candidates')}</small></div>
  </section>

  <section class="band">
    <header class="sec-h"><p class="eyebrow">${Lx('Amaç', 'Purpose')}</p><h2 class="display-s">${Lx('Neden yüzey değil de çukur?', 'Why a pit, not the surface?')}</h2></header>
    <div class="grid3">
      <article class="clay why"><span class="ico">☢</span><h3>${Lx('Radyasyon ve mikrometeorit', 'Radiation and micrometeorites')}</h3><p>${Lx('Tavanı olan bir boşluk, kalkanı Dünya\'dan taşımak yerine kayanın kendisini kalkan yapar. Sarkık duvar, tavanlı korunaklı hacim demektir.', 'A roofed void turns the rock itself into the shield, instead of launching shielding from Earth. An overhang means a roofed, sheltered volume.')}</p></article>
      <article class="clay why"><span class="ico">◐</span><h3>${Lx('Sıcaklık salınımı', 'Temperature swings')}</h3><p>${Lx('Ay yüzeyi gündüz 121 °C\'nin üstüne çıkar, gece −133 °C\'ye iner. Mare Tranquillitatis çukurunun gölgeli tabanı ise ~17 °C civarında kalır.', 'The lunar surface tops 121 °C by day and falls to −133 °C at night. The shaded floor of the Mare Tranquillitatis pit stays near ~17 °C.')} ${srcRefs(['NASA-WEATHER', 'HORVATH2022'])}</p></article>
      <article class="clay why"><span class="ico">⌖</span><h3>${Lx('Hazır giriş ve yerel kaynak', 'Ready entrance and local resources')}</h3><p>${Lx('Skylight, kazı yapmadan boşluğa iner. Yakındaki buz ve regolit; su, kalkan ve tuğla demektir: daha az kargo.', 'A skylight reaches the void without digging. Nearby ice and regolith mean water, shielding and bricks: less cargo.')}</p></article>
    </div>
  </section>

  <section class="band">
    <header class="sec-h"><p class="eyebrow">${Lx('Kaybolma', 'Don\'t get lost')}</p><h2 class="display-s">${Lx('Sitede 4 adımda gezin', 'Navigate the site in 4 steps')}</h2></header>
    <ol class="steps">${steps.map((s) => `<li><a class="clay step" href="${s.href}"><span class="num">${s.n}</span><h3>${s.h}</h3><p>${s.p}</p><span class="go">→</span></a></li>`).join('')}</ol>
  </section>

  <section class="band">
    <header class="sec-h"><p class="eyebrow">${Lx('Bulgular', 'Findings')}</p><h2 class="display-s">${Lx('Verinin söyledikleri', 'What the data says')}</h2></header>
    <div class="grid3">
      ${topCard(moonTop, Lx('Ay', 'Moon'))}
      ${topCard(marsTop, 'Mars')}
      ${nearest ? `<article class="clay find accent">
        <p class="eyebrow">${Lx('Su/buz içgörüsü', 'Water/ice insight')} <span class="rough">${t('rough')}</span></p>
        <h3>${esc(nm(nearest))}</h3>
        <p class="kpi">~${kmFmt(nearest.maliyet.buz_mesafe_km!)} km</p>
        <p>${Lx(`B seviyesindeki Mars adayları içinde haritalanmış buz sınırına (~35°K, SWIM) en yakın olanı. Arsia adayları ise ~${kmFmt(Math.min(...arsia))}–${kmFmt(Math.max(...arsia))} km uzakta.`, `Closest B-level Mars candidate to the mapped ice limit (~35°N, SWIM). The Arsia candidates sit ~${kmFmt(Math.min(...arsia))}–${kmFmt(Math.max(...arsia))} km away.`)}</p>
        <a class="btn small" href="#/maliyet">${Lx('Maliyete etkisi →', 'Effect on cost →')}</a>
      </article>` : ''}
    </div>
  </section>

  <section class="band">
    <header class="sec-h"><p class="eyebrow">${Lx('Dürüstlük', 'Integrity')}</p><h2 class="display-s">${Lx('Bu atlas neyi iddia etmez?', 'What this atlas does not claim')}</h2></header>
    <div class="grid3">
      <article class="glass note"><h3>${levelBadge('A')} ${levelBadge('B')} ${levelBadge('C')}</h3><p>${t('lvlA')}.<br>${t('lvlB')}.<br>${t('lvlC')}.</p></article>
      <article class="glass note"><h3>${Lx('Mars\'ta doğrulanmış mağara yok', 'No confirmed Mars cave')}</h3><p>${Lx('Mars kayıtlarının hepsi "aday"dır. Mutlak Mars mağara sıcaklığı yayımlanmamıştır; yalnız günlük salınımın küçük olduğu bilinir.', 'Every Mars record is a "candidate". No absolute Mars cave temperature is published; only that the diurnal swing is small.')}</p></article>
      <article class="glass note"><h3>${Lx('Boyut skora girmez', 'Size is not scored')}</h3><p>${Lx('Ay/Mars tüpleri Dünya\'dakilerden çok daha büyük olabilir. Benzerlik; şekil (d/D), duvar ve termal davranışla hesaplanır. Eksik veri, güven bandını genişletir.', 'Lunar/martian tubes may be far larger than Earth\'s. Similarity uses shape (d/D), walls and thermal behaviour. Missing data widens the confidence band.')}</p></article>
    </div>
  </section>

  <footer class="foot">
    <p>${Lx('Veri: NASA Trek, LROC (ASU), HiRISE (UArizona), THEMIS, LRO Diviner, USGS, NPS ve hakemli yayınlar.', 'Data: NASA Trek, LROC (ASU), HiRISE (UArizona), THEMIS, LRO Diviner, USGS, NPS and peer-reviewed papers.')}
    <a href="#/kaynaklar">${t('vSources')}</a> · <a href="#/metodoloji">${t('vMethod')}</a></p>
  </footer>`;
  $('#home').querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.addEventListener('click', () => goCompare(b.dataset.go!)));
  initHeroMap();
}

let heroMap: L.Map | null = null;
let heroTimer = 0;
function initHeroMap() {
  if (heroMap) { heroMap.remove(); heroMap = null; }
  cancelAnimationFrame(heroTimer);
  heroMap = L.map('hero-map', { crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
  trekLayer('themis').addTo(heroMap);
  heroMap.setView([-6.4, -120.2], 6);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const step = () => { if (heroMap && S.view === 'home') { heroMap.panBy([0.25, 0.08], { animate: false }); heroTimer = requestAnimationFrame(step); } };
    heroTimer = requestAnimationFrame(step);
  }
}

function renderRank() {
  const block = (body: 'ay' | 'mars') => {
    const ranked = rankSites(doc.adaylar, body, S.weights);
    const excluded = doc.adaylar.filter((c) => c.govde === body && c.kanit_seviyesi === 'C');
    return `<section class="rankcol">
      <h2 class="display-s">${body === 'ay' ? t('moon') : 'Mars'}</h2>
      <p class="muted small">${body === 'ay'
        ? Lx('Ay için su/buz bileşeni yok (kaynaklı referans eklenmedi); endeks Mars ile doğrudan karşılaştırılamaz.', 'No water/ice component for the Moon (no sourced reference yet); the index is not directly comparable to Mars.')
        : Lx('Hepsi ADAY; doğrulanmış Mars mağarası yok. Buz mesafesi yalnız kuzey 35°K referansıyla kaba tahmindir.', 'All are CANDIDATES; no confirmed Mars cave. Ice distance is a rough estimate from the northern 35°N reference only.')}</p>
      <ol class="ranklist">${ranked.map((r, i) => `<li class="clay rk${i === 0 ? ' first' : ''}">
        <span class="pos">${i + 1}</span>
        <div class="rk-main">
          <h3>${levelBadge(r.c.kanit_seviyesi)} ${esc(nm(r.c))} <small>${esc(r.c.bolge)}</small></h3>
          <ul class="reasons">${siteReasons(r.c).map((x) => `<li>${esc(x)}</li>`).join('') || `<li class="nd">${t('noData')}</li>`}</ul>
          ${miniBars(r.c)}
        </div>
        <div class="rk-side">
          <span class="idx">${r.endeks === null ? '—' : Math.round(r.endeks * 100)}</span>
          <small>${t('coverage')} ${Math.round(r.kapsam * 100)}% · ${EN() ? 'conservative' : 'temkinli'} ${r.endeks === null ? '—' : Math.round(r.endeks * r.kapsam * 100)}</small>
          <button class="btn small" data-go="${r.c.aday_id}">${t('vCompare')} →</button>
          <button class="btn small primary" data-play="${r.c.aday_id}">▶ ${Lx('Oyna', 'Play')}</button>
        </div>
      </li>`).join('')}</ol>
      <details class="glass excl"><summary>${Lx(`Üs adayı sayılmayanlar (C seviyesi, ${excluded.length})`, `Not counted as base candidates (level C, ${excluded.length})`)}</summary>
        <ul>${excluded.map((c) => `<li>${levelBadge('C')} ${esc(nm(c))} <small>${esc(c.bolge)}${c.sinif === 'karst' ? ' · KARST' : ''}</small></li>`).join('')}</ul></details>
    </section>`;
  };
  $('#rank').innerHTML = `
  <header class="pagehead">
    <p class="eyebrow">${Lx('Yerleşim', 'Settlement')}</p>
    <h1 class="display-m">${Lx('Üs için en uygun yerler', 'Best places for a base')}</h1>
    <p class="lead">${Lx('Sıralama kuralı açık: önce kanıt seviyesi (A > B; C sayılmaz), sonra temkinli endeks (eksik bileşen 0 sayılır, yani endeks × kapsam). Böylece verisi az bir aday, verisi tam olanın önüne geçemez. Ağırlıkları değiştirirsen sıralama canlı güncellenir.', 'The rule is explicit: evidence level first (A > B; C excluded), then a conservative index (missing components count as 0, i.e. index × coverage). A data-poor site cannot outrank a well-measured one. Change the weights and the ranking updates live.')} <span class="rough">${t('rough')}</span></p>
    <div class="glass weights">${COST_KEYS.map((k) => `<label>${t(('c_' + k) as Key)} <input type="range" data-k="${k}" min="0" max="3" step="0.5" value="${S.weights[k]}"><b>×${S.weights[k]}</b></label>`).join('')}</div>
  </header>
  <div class="rankgrid">${block('ay')}${block('mars')}</div>`;
  bindSliders($('#rank'));
  $('#rank').querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.addEventListener('click', () => goCompare(b.dataset.go!)));
  $('#rank').querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.play!)));
}

let calcKg = 1000;
function renderCost() {
  const strat = [
    { ico: '⛰', h: Lx('Kalkanı taşıma, çukurun tavanını kullan', 'Don\'t launch shielding: use the pit roof'), p: Lx('Tavanlı boşluk; radyasyon, mikrometeorit ve termal salınıma karşı hazır kalkandır. En güçlü örnek, sarkık duvarlı ve radar kanıtlı Mare Tranquillitatis çukuru.', 'A roofed void is ready-made shielding against radiation, micrometeorites and thermal swings. The strongest example is the Mare Tranquillitatis pit, with overhangs and radar evidence.'), src: ['LROC-ATLAS', 'CARRER2024'], go: 'AY-01' },
    { ico: '❄', h: Lx('Buzu kalkan ve su olarak kullan (Mars)', 'Use ice as shield and water (Mars)'), p: Lx('Jezero verisine dayalı çalışma: yıllık 50 mSv sınırı için 325 mm su buzu yeterli, aynı koruma için 975 mm regolit gerekir. Buz, regolitin üçte biri kalınlıkta aynı işi görür.', 'A Jezero-based study: 325 mm of water ice meets the 50 mSv/yr limit; regolith needs 975 mm for the same protection. Ice does the job at one third the thickness.'), src: ['ICE-SHIELD'], go: 'MARS-12' },
    { ico: '▦', h: Lx('Regolitten tuğla ve 3D baskı', 'Bricks and 3D printing from regolith'), p: Lx('ESA ve Foster + Partners, simüle Ay toprağı + MgO ile 1,5 tonluk blok bastı. Bağlayıcısız sinterleme Dünya\'dan bağlayıcı taşımayı ortadan kaldırır. Bu bir yüzey stratejisidir; çukur üssünü tamamlar.', 'ESA and Foster + Partners printed a 1.5 t block from simulated lunar soil + MgO. Binder-free sintering removes the need to ship binder from Earth. It is a surface strategy that complements a pit base.'), src: ['ESA-3DPRINT'] },
    { ico: '◐', h: Lx('Termal kararlılık = daha az enerji', 'Thermal stability = less energy'), p: Lx('Yüzey 121 °C ile −133 °C arasında salınırken çukur tabanı ~17 °C\'de kalabilir. Isıtma/soğutma için daha az güç ve radyatör, daha az kargo demektir.', 'While the surface swings between 121 °C and −133 °C, a pit floor can stay near ~17 °C. Less power and radiator for heating/cooling means less cargo.'), src: ['NASA-WEATHER', 'HORVATH2022'], go: 'AY-01' },
    { ico: '⛽', h: Lx('Yakıtı yerinde üret', 'Make propellant in situ'), p: Lx('Ay veya Mars\'ta üretilen her 1 kg itici gaz, alçak Dünya yörüngesinde 7,4–11,3 kg tasarruf sağlar.', 'Every 1 kg of propellant made on the Moon or Mars saves 7.4–11.3 kg in low Earth orbit.'), src: ['NTRS-20180002086'] },
    { ico: '⊕', h: Lx('Önce Dünya ikizinde prova et', 'Rehearse at the Earth twin first'), p: Lx('Lanzarote (ESA PANGAEA-X), İzlanda ve Hawaii tüpleri; iniş, iletişim, LiDAR ve termal testlerin ucuz provasıdır. Ölçek farkı provayla giderilemez, ama prosedür riskini düşürür.', 'Lanzarote (ESA PANGAEA-X), Iceland and Hawaii tubes are cheap rehearsals for descent, comms, LiDAR and thermal tests. Rehearsal cannot remove the scale gap, but it lowers procedural risk.'), src: ['TAKIM-NOTU'] },
  ];
  const lo = calcKg * 10.5, hi = calcKg * 17, plo = calcKg * 7.4, phi = calcKg * 11.3;
  const n = (x: number) => Math.round(x).toLocaleString(EN() ? 'en-US' : 'tr-TR');
  $('#cost').innerHTML = `
  <header class="pagehead">
    <p class="eyebrow">${Lx('Maliyet', 'Cost')}</p>
    <h1 class="display-m">${Lx('Ay ve Mars\'ta üs maliyetini nasıl düşürürüz?', 'How do we cut base cost on the Moon and Mars?')}</h1>
    <p class="lead">${Lx('Uzayda maliyetin büyük kısmı, Dünya\'dan kaldırılan kütledir. Her strateji aynı soruya cevap verir: neyi götürmek zorunda kalmayız?', 'Most of the cost in space is mass lifted from Earth. Every strategy answers one question: what do we not have to launch?')}</p>
  </header>
  <section class="calc clay">
    <div>
      <p class="eyebrow">${Lx('Kaldıraç hesaplayıcı', 'Leverage calculator')} <span class="rough">${t('rough')}</span></p>
      <label class="calc-in">${Lx('Yerinde üretilerek Dünya\'dan götürülmeyen kütle (kg)', 'Mass produced locally instead of launched (kg)')}
        <input type="number" id="calc-kg" min="0" step="100" value="${calcKg}"></label>
      <p class="small muted">${Lx('Bu girdiyi sen veriyorsun; site tonaj uydurmaz. Oranlar NASA NTRS raporlarından (takım notu; metinde doğrulanmalı).', 'You supply this input; the site never invents tonnage. Ratios are from NASA NTRS reports (team note; verify in text).')}</p>
    </div>
    <div class="calc-out">
      <div class="glass"><span>${Lx('Mars yüzeyi → LEO tasarrufu', 'Mars surface → LEO saving')}</span><b>${n(lo)}–${n(hi)} kg</b><small>×10,5–17 · ${srcRefs(['NTRS-20160006324'])}</small></div>
      <div class="glass"><span>${Lx('İtici gaz ise → LEO tasarrufu', 'If propellant → LEO saving')}</span><b>${n(plo)}–${n(phi)} kg</b><small>×7,4–11,3 · ${srcRefs(['NTRS-20180002086'])}</small></div>
    </div>
  </section>
  <section class="band">
    <div class="grid3">${strat.map((s) => `<article class="clay strat"><span class="ico">${s.ico}</span><h3>${s.h}</h3><p>${s.p}</p><p class="small">${srcRefs(s.src)}</p>${s.go ? `<button class="btn small" data-go="${s.go}">${Lx('İlgili adayı gör →', 'See the related site →')}</button>` : ''}</article>`).join('')}</div>
  </section>
  <section class="band">
    <header class="sec-h"><h2 class="display-s">${Lx('Kalkan kalınlığı: buz ve regolit', 'Shield thickness: ice vs regolith')}</h2><p class="muted small">${Lx('Yıllık 50 mSv sınırı için gereken en düşük kalınlık', 'Minimum thickness for the 50 mSv/yr limit')} ${srcRefs(['ICE-SHIELD'])}</p></header>
    <div class="thick glass">
      <div class="th-row"><span>${Lx('Su buzu', 'Water ice')}</span><i class="ice" style="width:${(325 / 975) * 100}%"></i><b>325 mm</b></div>
      <div class="th-row"><span>Regolit</span><i class="reg" style="width:100%"></i><b>975 mm</b></div>
    </div>
  </section>
  <section class="band">
    <div class="grid2">
      <article class="glass note"><h3>${Lx('Ay stratejisi', 'Moon strategy')}</h3><ul>
        <li>${Lx('Radar kanıtlı, sarkık duvarlı çukura yerleş (Mare Tranquillitatis).', 'Settle in the radar-evidenced, overhung pit (Mare Tranquillitatis).')}</li>
        <li>${Lx('~17 °C tabanla termal enerji ihtiyacını düşür.', 'Cut thermal energy needs with the ~17 °C floor.')}</li>
        <li>${Lx('Yüzey yapıları için regolit sinterleme / 3D baskı.', 'Regolith sintering / 3D printing for surface structures.')}</li>
        <li class="warn">${Lx('Zorluk: elektrostatik Ay tozu ekipmana ve sağlığa zarar verir.', 'Challenge: electrostatic lunar dust harms equipment and health.')}</li></ul></article>
      <article class="glass note"><h3>${Lx('Mars stratejisi', 'Mars strategy')}</h3><ul>
        <li>${Lx('Buz sınırına yakın B adaylarını öncele (Elysium batı yanağı).', 'Prioritise B candidates near the ice limit (Elysium west flank).')}</li>
        <li>${Lx('Buzla kalkan: regolitin üçte biri kalınlık.', 'Shield with ice: one third the thickness of regolith.')}</li>
        <li>${Lx('Yerinde itici gaz ile dönüş yakıtını götürme.', 'Make return propellant locally instead of launching it.')}</li>
        <li class="warn">${Lx('Zorluk: mağara buzu kalıcı olmayabilir (Lava Beds örneği).', 'Challenge: cave ice may not last (Lava Beds example).')}</li></ul></article>
    </div>
  </section>`;
  const inp = $('#calc-kg') as HTMLInputElement;
  inp.addEventListener('change', () => { calcKg = Math.max(0, Number(inp.value) || 0); renderCost(); });
  $('#cost').querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.addEventListener('click', () => goCompare(b.dataset.go!)));
}

function renderGuide() {
  const g = $('#guide');
  const flow: View[] = ['map', 'compare', 'rank', 'cost', 'game'];
  if (!flow.includes(S.view)) { g.hidden = true; return; }
  const c = cand(S.sel);
  const items = [
    { v: 'map', h: Lx('1 · Aday seç', '1 · Pick a candidate'), href: '#/atlas' },
    { v: 'compare', h: Lx('2 · Dünya ikizi ve neden', '2 · Earth twin and why'), href: '#/karsilastir' },
    { v: 'rank', h: Lx('3 · Üs sıralaması', '3 · Base ranking'), href: '#/siralama' },
    { v: 'cost', h: Lx('4 · Maliyeti azalt', '4 · Cut the cost'), href: '#/maliyet' },
    { v: 'game', h: Lx('5 · Görevi oyna', '5 · Play the mission'), href: '#/gorev' },
  ];
  const idx = flow.indexOf(S.view);
  const next = items[idx + 1];
  g.hidden = false;
  g.innerHTML = `<ol class="guide-steps">${items.map((it, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><a href="${it.href}"${i === idx ? ' aria-current="step"' : ''}>${it.h}</a></li>`).join('')}</ol>
    <span class="guide-sel">${c ? `${levelBadge(c.kanit_seviyesi)} ${esc(nm(c))}` : `<em class="nd">${t('pickCandidate')}</em>`}</span>
    ${next ? `<a class="btn small primary" href="${next.href}">${Lx('Sonraki adım', 'Next step')} →</a>` : ''}`;
}


// ---------------------------------------------------------------- görev oyunu
const ACT: Record<G.ActionId, { ico: string; tr: string; en: string; dtr: string; den: string }> = {
  verify: { ico: '◎', tr: 'Boşluğu doğrula', en: 'Confirm the void', dtr: 'Yer radarı + iniş kamerası. B sahada yerleşmeden önce şart.', den: 'Ground radar + descent camera. Required at B sites before moving in.' },
  scout: { ico: '⌖', tr: 'Keşif robotu', en: 'Scout robot', dtr: 'Bilinmeyen özellik riskini düşürür; değer uydurmaz.', den: 'Lowers unknown-feature risk; never invents values.' },
  rehearse: { ico: '⊕', tr: 'Dünya ikizinde prova', en: 'Rehearse at Earth twin', dtr: 'Yalnız ortak özellikler için riski düşürür. Ölçek farkı kalır.', den: 'Lowers risk only for shared features. Scale gap remains.' },
  power: { ico: '☀', tr: 'Enerji kur', en: 'Build power', dtr: 'Güneş paneli + batarya.', den: 'Solar panels + batteries.' },
  import_shield: { ico: '⇣', tr: "Kalkanı Dünya'dan getir", en: 'Ship shielding from Earth', dtr: 'Hızlı ama en pahalı yol.', den: 'Fast but the most expensive path.' },
  sinter: { ico: '▦', tr: 'Regolit tuğla bas', en: 'Print regolith bricks', dtr: 'Ucuz kargo, enerji ister.', den: 'Cheap on cargo, needs power.' },
  mine_ice: { ico: '❄', tr: 'Buz kaz', en: 'Mine ice', dtr: 'Verim buz sınırına uzaklığa bağlı (yalnız Mars).', den: 'Yield depends on distance to ice (Mars only).' },
  ice_shield: { ico: '◇', tr: 'Buz kalkanı yap', en: 'Build ice shield', dtr: '325 mm buz ≈ 975 mm regolit.', den: '325 mm ice ≈ 975 mm regolith.' },
  move_in: { ico: '⌂', tr: 'Çukura yerleş', en: 'Move into the pit', dtr: 'Doğal kalkan; termal tampon varsa enerji tasarrufu.', den: 'Natural shielding; saves power where thermally buffered.' },
  wait: { ico: '…', tr: 'Bekle', en: 'Wait', dtr: 'Hiçbir şey yapma.', den: 'Do nothing.' },
};
let game: G.State | null = null;
let gameSeed = 2026;
let gameMap: L.Map | null = null;
const tx = (x: G.Txt) => (EN() ? x.en : x.tr);
const playableSites = () => doc.adaylar.filter((c) => c.kanit_seviyesi !== 'C');

function startGame(id: string, seed = gameSeed) {
  const c = cand(id)!;
  const p = G.siteFromCandidate(c, (d) => EARTH.get(d)!.ad);
  if (!p) return;
  S.sel = id;
  gameSeed = seed;
  game = G.newGame(p, seed);
  if (location.hash !== '#/gorev') location.hash = '#/gorev';
  else renderGame();
}

function meter(label: string, v: number, cls = '', max = 100, suffix = '') {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="meter ${cls}"><span>${label}</span><div class="mtrack"><i style="width:${pct}%"></i></div><b>${Math.round(v)}${suffix}</b></div>`;
}

function renderGame() {
  if (gameMap) { gameMap.remove(); gameMap = null; }
  const el = $('#game');
  if (!game) {
    const c0 = cand(S.sel);
    const p0 = c0 && c0.kanit_seviyesi !== 'C' ? G.siteFromCandidate(c0, (d) => EARTH.get(d)!.ad) : null;
    const pick = p0 ? c0!.aday_id : 'AY-01';
    game = G.newGame(G.siteFromCandidate(cand(pick)!, (d) => EARTH.get(d)!.ad)!, gameSeed);
  }
  const s = game, p = s.site, c = cand(p.id)!;
  const acts = G.actions(s);
  const night = G.isLunarNight(s);
  const ended = s.done;
  const report = EN()
    ? `${s.imported} cargo units came from Earth. ${s.inTube ? 'The habitat was inside the pit.' : 'The habitat stayed on the surface.'} This is a game model, not a real base forecast for "${esc(nm(c))}"${p.govde === 'mars' ? ', and the site is still a CANDIDATE' : ''}.`
    : `Dünya'dan ${s.imported} kargo birimi kullanıldı. ${s.inTube ? 'Habitat çukurun içindeydi.' : 'Habitat yüzeyde kaldı.'} Bu sonuç bir oyun modelidir; "${esc(nm(c))}" için gerçek bir üs tahmini değildir${p.govde === 'mars' ? ' ve saha hâlâ bir ADAYDIR' : ''}.`;
  el.innerHTML = `
  <header class="pagehead gamehead">
    <div>
      <p class="eyebrow">${Lx('Simülasyon', 'Simulation')} · <span class="rough">${Lx('OYUN MODELİ, TAHMİN DEĞİL', 'GAME MODEL, NOT A PREDICTION')}</span></p>
      <h1 class="display-m">${Lx('Mağara Üssü <em>Görevi</em>', 'Cave Base <em>Mission</em>')}</h1>
      <p class="lead">${Lx("Gerçek bir aday seç, 10 haftalık görevi yönet. Sahanın kanıt seviyesi, derinliği, sarkık duvarı, termal tamponu, buza uzaklığı ve Dünya ikizi atlas verisinden gelir. Olay olasılıkları ve puanlar bizim tasarım seçimimizdir.", "Pick a real candidate and run a 10-week mission. The site's evidence level, depth, overhang, thermal buffering, distance to ice and Earth twin come from atlas data. Event odds and scores are our design choices.")}</p>
    </div>
    <div class="glass gamepick">
      <label>${Lx('Saha', 'Site')} <select id="g-site">${playableSites().map((x) => `<option value="${x.aday_id}"${x.aday_id === p.id ? ' selected' : ''}>${x.govde === 'mars' ? 'Mars' : t('moon')} · ${x.kanit_seviyesi} · ${esc(nm(x))}</option>`).join('')}</select></label>
      <label>${Lx('Tohum', 'Seed')} <input type="number" id="g-seed" value="${gameSeed}"></label>
      <button class="btn small" id="g-new">↻ ${Lx('Yeniden başlat', 'Restart')}</button>
      <small>${Lx('Aynı saha + tohum = aynı görev (demo videosu için).', 'Same site + seed = same mission (for the demo video).')}</small>
    </div>
  </header>
  <div class="gamegrid">
    <section class="clay gsite">
      <div id="g-map" class="mini"></div>
      <h3>${levelBadge(p.level)} ${esc(nm(c))}</h3>
      <ul class="gfacts">
        <li><span>${t('depth')}</span><b>${p.depthMin === null ? `<em class="nd">${t('noData')}</em>` : `≥${p.depthMin} m`}</b></li>
        <li><span>${t('overhang')}</span><b>${yn(p.overhang)}</b></li>
        <li><span>${t('opening')}</span><b>${yn(p.opening)}</b></li>
        <li><span>${t('thermal')}</span><b>${yn(p.thermal)}</b></li>
        <li><span>${t('iceDist')}</span><b>${p.iceKm === null ? `<em class="nd">${t('noData')}</em>` : `~${kmFmt(p.iceKm)} km`}</b></li>
        <li><span>${t('bestTwin')}</span><b>${p.twinName ? `${esc(p.twinName)} <small>(${p.twinShared}/4 ${Lx('ortak', 'shared')})</small>` : `<em class="nd">${t('noData')}</em>`}</b></li>
      </ul>
      ${p.govde === 'mars' ? `<p class="small warn">${t('marsNote')}</p>` : ''}
    </section>
    <section class="gcenter">
      <div class="glass gstatus">
        <div class="turn"><span>${Lx('Hafta', 'Week')}</span><b>${s.turn}<small>/${G.MAX_TURNS}</small></b>${night ? `<em class="night">☾ ${Lx('Ay gecesi', 'Lunar night')}</em>` : ''}</div>
        ${meter(Lx('Mürettebat sağlığı', 'Crew health'), s.health, s.health < 40 ? 'bad' : 'good')}
        ${meter(Lx("Kargo (Dünya'dan)", 'Cargo (from Earth)'), s.cargo, 'cargo')}
        ${meter(Lx('Enerji', 'Power'), s.power, 'power')}
        ${meter(Lx('Kalkan', 'Shielding'), s.shield, 'shield', 100, '%')}
        ${meter(Lx('Su', 'Water'), s.water, 'water', 60)}
        ${meter(Lx('Risk (bilinmeyenler)', 'Risk (unknowns)'), s.risk, 'risk', 100, '%')}
        <div class="gmini"><span>${Lx('Bilim', 'Science')} <b>${s.science}</b></span><span>${Lx('Doğrulandı', 'Confirmed')} <b>${s.verified ? '✓' : '✗'}</b></span><span>${Lx('Çukurda', 'In pit')} <b>${s.inTube ? '✓' : '✗'}</b></span><span>${Lx("Dünya'dan kargo", 'Cargo from Earth')} <b>${s.imported}</b></span></div>
      </div>
      ${ended ? `<div class="clay gend ${s.outcome}">
        <p class="eyebrow">${Lx('Görev raporu', 'Mission report')}</p>
        <h2 class="display-s">${tx(G.grade(s))}</h2>
        <p class="kpi">${G.score(s)} <small>${Lx('puan', 'pts')}</small></p>
        <p>${report}</p>
        <div class="cta"><button class="btn primary" id="g-again">↻ ${Lx('Yeni tohumla tekrar', 'Replay with new seed')}</button><a class="btn ghost" href="#/maliyet">${Lx('Gerçek stratejiler →', 'Real strategies →')}</a></div>
      </div>` : `<div class="gactions">${acts.map((a) => `<button class="clay gact" data-act="${a.id}" ${a.ok ? '' : 'disabled'} title="${esc(a.why ? tx(a.why) : '')}">
          <span class="ico">${ACT[a.id].ico}</span><b>${EN() ? ACT[a.id].en : ACT[a.id].tr}</b><small>${EN() ? ACT[a.id].den : ACT[a.id].dtr}</small><em>${tx(a.cost)}${!a.ok && a.why ? ` · ${tx(a.why)}` : ''}</em></button>`).join('')}</div>`}
    </section>
    <section class="glass glog" aria-live="polite">
      <h3>${Lx('Görev günlüğü', 'Mission log')}</h3>
      <ol>${[...s.log].reverse().map((l) => `<li class="lg-${l.kind}"><span>${l.turn ? `${Lx('H', 'W')}${l.turn}` : '—'}</span>${esc(tx(l.text))}</li>`).join('')}</ol>
    </section>
  </div>
  <section class="band">
    <div class="grid3">
      <article class="glass note"><h3>${Lx('Gerçek veriden gelenler', 'From real data')}</h3><p>${Lx('Kanıt seviyesi, derinlik, sarkık duvar, açık giriş, termal tampon, buz mesafesi (kaba), Dünya ikizi ve ortak özellik sayısı.', 'Evidence level, depth, overhang, opening, thermal buffering, ice distance (rough), Earth twin and number of shared features.')}</p></article>
      <article class="glass note"><h3>${Lx('Kaynaklı kaldıraçlar', 'Sourced levers')}</h3><p>${Lx("Buz kalkanı 1:3 verim (325 vs 975 mm), ~2 haftalık Ay gecesi, termal tampon yalnız verinin 'evet' dediği yerde. Ay'da buz kazma yok: kaynaklı referans yok.", "Ice shield 1:3 efficiency (325 vs 975 mm), ~2-week lunar night, thermal buffering only where data says yes. No ice mining on the Moon: no sourced reference.")} ${srcRefs(['ICE-SHIELD', 'NASA-WEATHER'])}</p></article>
      <article class="glass note"><h3>${Lx('Bizim tasarım seçimlerimiz', 'Our design choices')}</h3><p>${Lx('Olay olasılıkları, hasar, kargo/enerji birimleri ve puan soyuttur; kg veya radyasyon dozu değildir. Keşif riski düşürür ama atlasa değer eklemez.', 'Event odds, damage, cargo/power units and score are abstract; not kg or radiation dose. Scouting lowers risk but never adds values to the atlas.')}</p></article>
    </div>
  </section>`;
  el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => { game = G.play(game!, b.dataset.act as G.ActionId); renderGame(); }));
  ($('#g-site') as HTMLSelectElement).addEventListener('change', (ev) => startGame((ev.target as HTMLSelectElement).value));
  $('#g-new').addEventListener('click', () => startGame(p.id, Number(($('#g-seed') as HTMLInputElement).value) || 1));
  const again = document.getElementById('g-again');
  if (again) again.addEventListener('click', () => startGame(p.id, gameSeed + 1));
  gameMap = L.map('g-map', { crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: true });
  trekLayer(p.govde === 'ay' ? 'wac' : 'themis').addTo(gameMap);
  if (c.enlem !== null && c.boylam_180 !== null) {
    gameMap.setView([c.enlem, c.boylam_180], 6);
    L.marker([c.enlem, c.boylam_180], { icon: markerIcon(c, true) }).addTo(gameMap);
  } else gameMap.setView([0, 0], 1);
}

// ---------------------------------------------------------------- iskelet / yönlendirme
const ROUTES: Record<string, View> = { home: 'home', atlas: 'map', karsilastir: 'compare', siralama: 'rank', maliyet: 'cost', gorev: 'game', 'ay-mars': 'cross', metodoloji: 'method', kaynaklar: 'sources' };
const VIEW_IDS: Record<View, string> = { home: 'home', map: 'mapview', compare: 'compare', rank: 'rank', cost: 'cost', game: 'game', cross: 'cross', method: 'method', sources: 'sources' };
const NAV_KEY: Record<View, Key> = { home: 'vHome', map: 'vMap', compare: 'vCompare', rank: 'vRank', cost: 'vCost', game: 'vGame', cross: 'vCross', method: 'vMethod', sources: 'vSources' };

function setView(v: View) {
  S.view = v;
  render();
  window.scrollTo({ top: 0 });
  if (v === 'map') setTimeout(() => mainMap.invalidateSize(), 0);
}

function fromHash() {
  const key = location.hash.replace(/^#\/?/, '') || 'home';
  setView(ROUTES[key] ?? 'home');
}

function render() {
  document.documentElement.lang = getLang();
  document.title = `${t('title')} · ${t(NAV_KEY[S.view])}`;
  $('#title').textContent = t('title');
  $('#subtitle').textContent = t('subtitle');
  (document.querySelector('.skip') as HTMLElement).textContent = Lx('İçeriğe geç', 'Skip to content');
  document.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) => {
    b.textContent = b.dataset.body === 'mars' ? t('mars') : t('moon');
    b.setAttribute('aria-pressed', String(b.dataset.body === S.body));
  });
  document.querySelectorAll<HTMLAnchorElement>('#nav a[data-view]').forEach((a) => {
    a.textContent = t(NAV_KEY[a.dataset.view as View]);
    if (a.dataset.view === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  $('#basemap-label').textContent = t('basemap');
  for (const id of Object.values(VIEW_IDS)) $('#' + id).hidden = true;
  $('#' + VIEW_IDS[S.view]).hidden = false;
  document.body.dataset.view = S.view;
  renderGuide();
  if (S.view === 'home') renderHome();
  if (S.view === 'map') { renderList(); renderDetail(); }
  if (S.view === 'compare') renderCompare();
  if (S.view === 'rank') renderRank();
  if (S.view === 'cost') renderCost();
  if (S.view === 'game') renderGame();
  if (S.view === 'cross') renderCross();
  if (S.view === 'method') renderMethod();
  if (S.view === 'sources') renderSources();
}

// ---------------------------------------------------------------- jüri modu (60 sn otomatik tur)
interface Scene { ms: number; tr: string; en: string; run: () => void | Promise<void> }
let tourOn = false;
let tourTimers: number[] = [];
const wait = (ms: number) => new Promise<void>((r) => { tourTimers.push(window.setTimeout(r, ms)); });
const go = (h: string) => { if (location.hash !== h) location.hash = h; else fromHash(); };

function tourScenes(): Scene[] {
  const elys = 'MARS-12';
  return [
    { ms: 7000, tr: 'Ay ve Mars\'ta üs: kalkanı Dünya\'dan taşımak yerine bir lav çukurunun tavanını kullanabilir miyiz?', en: 'A base on the Moon and Mars: can a lava pit\'s roof replace shielding launched from Earth?', run: () => go('#/home') },
    { ms: 8000, tr: 'Atlas: NASA Trek haritasında 32 aday. Harf = kanıt seviyesi. Mars\'ta hiçbiri doğrulanmış değil, hepsi aday.', en: 'Atlas: 32 candidates on NASA Trek imagery. Letter = evidence level. None on Mars is confirmed; all are candidates.', run: () => { go('#/atlas'); setTimeout(() => { mainMap.invalidateSize(); select('MARS-01'); }, 300); } },
    { ms: 10000, tr: 'Karşılaştır: Arsia\'daki "Dena" adayının Dünya ikizi. Neyin benzediğini, neyin bilinmediğini ve güven bandını gösteriyoruz. Boyut skora girmez.', en: 'Compare: the Earth twin of the "Dena" candidate on Arsia. We show what matches, what is unknown and the confidence band. Size is never scored.', run: () => go('#/karsilastir') },
    { ms: 9000, tr: 'Ay ↔ Mars: aynı özelliklerle Mare Tranquillitatis çukuru (radar kanıtı, ~17 °C taban) ile Mars adayı yan yana.', en: 'Moon ↔ Mars: the Mare Tranquillitatis pit (radar evidence, ~17 °C floor) side by side with a Mars candidate.', run: () => { S.crossA = 'MARS-01'; S.crossB = 'AY-01'; go('#/ay-mars'); } },
    { ms: 9000, tr: 'Üs sıralaması: Mars\'ta 1. sıra Elysium batı yanağı. Sarkık duvarlı, termal tamponlu ve buz sınırına ~384 km. Arsia adayları ~2.400 km uzakta.', en: 'Base ranking: Mars #1 is the Elysium west flank. Overhung, thermally buffered, ~384 km from the ice limit. Arsia candidates sit ~2,400 km away.', run: () => go('#/siralama') },
    { ms: 8000, tr: 'Maliyet: 325 mm buz, 975 mm regolitin kalkanlığını yapar. Yerinde üretilen her kg, yörüngede kat kat tasarruf demek.', en: 'Cost: 325 mm of ice shields like 975 mm of regolith. Every kg made locally saves many kg in orbit.', run: () => go('#/maliyet') },
    { ms: 12000, tr: 'Görev oyunu: Elysium adayında 10 haftalık görev. Dünya ikizinde prova riski düşürür ama ölçek farkını kaldıramaz.', en: 'Mission game: a 10-week mission at the Elysium candidate. Rehearsing at the Earth twin lowers risk but cannot remove the scale gap.', run: async () => {
      startGame(elys, 2026);
      await wait(900);
      for (let i = 0; i < 10 && game && !game.done && tourOn; i++) { game = G.play(game, G.sensiblePolicy(game)); renderGame(); await wait(950); }
    } },
    { ms: 6000, tr: 'Her sayının kaynağı var; bilinmeyen değer uydurulmaz. Lav Çukurları Atlası: NASA Space Apps 2026.', en: 'Every number has a source; unknowns are never invented. Lava Pit Atlas: NASA Space Apps 2026.', run: () => go('#/home') },
  ];
}

/** 30 sn video modu: Space Apps 2026 video şablonuna birebir uyar
 *  (0:00 takım · 0:02 challenge · 0:05 proje adı · 0:10 nasıl çalışır + NASA verisi · 0:20–0:30 gelecek).
 *  Altyazı = sahne metni (EN için ?lang=en). Kayıt: ?video=1&lang=en&team=TakımAdı */
function videoScenes(team: string): Scene[] {
  return [
    { ms: 2000, tr: `Merhaba, biz ${team} takımıyız.`, en: `Hi, we are team ${team}.`, run: () => go('#/home') },
    { ms: 3000, tr: 'Challenge: Ay ve Mars\'taki kalıcı üs yerlerine benzeyen Dünya yerlerini bulmak.', en: 'Our challenge: find places on Earth that resemble permanent base sites on the Moon and Mars.', run: () => {} },
    { ms: 4500, tr: 'Lav Çukurları Atlası: ilk üs bir lav çukurunun içinde kurulabilir.', en: 'Lava Pit Atlas: the first base could be built inside a lava pit.', run: () => {} },
    { ms: 3500, tr: '32 Ay ve Mars çukur adayını NASA Trek, LROC, HiRISE ve THEMIS verisiyle haritalıyoruz…', en: 'We map 32 lunar and martian pit candidates with NASA Trek, LROC, HiRISE and THEMIS data…', run: () => { go('#/atlas'); setTimeout(() => { mainMap.invalidateSize(); select('MARS-01'); }, 250); } },
    { ms: 3500, tr: '…ve her birini Dünya lav tüpleriyle özellik özellik eşleştiriyoruz: neyin benzediğini ve neyin benzemediğini.', en: '…and match each to Earth lava tubes feature by feature: what matches, and what does not.', run: () => go('#/karsilastir') },
    { ms: 3000, tr: 'Mars\'ta en iyi aday: Elysium batı yanağı, haritalanmış buza ~384 km (kaba).', en: 'Best Mars candidate: Elysium west flank, ~384 km from mapped ice (rough).', run: () => go('#/siralama') },
    { ms: 4600, tr: 'Sırada: Dünya ikizlerinde prova, yerel buz ve regolitle inşa, Dünya\'dan daha az fırlatma.', en: 'Next: rehearse at Earth twins, build with local ice and regolith, and launch less from Earth.', run: async () => {
      startGame('MARS-12', 2026);
      await wait(300);
      for (let i = 0; i < 6 && game && !game.done && tourOn; i++) { game = G.play(game, G.sensiblePolicy(game)); renderGame(); await wait(420); }
    } },
    { ms: 4000, tr: 'Her sayının kaynağı var. Mars\'ta henüz doğrulanmış mağara yok, şimdilik.', en: 'Every number is sourced. No Mars cave is confirmed — yet.', run: () => go('#/home') },
  ];
}

let tourMode: 'tour' | 'video' = 'tour';
function tourUI(i: number, n: number, sc: Scene | null) {
  let el = document.getElementById('tour');
  if (!sc) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'tour';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `tour glass${tourMode === 'video' ? ' video' : ''}`;
  el.innerHTML = tourMode === 'video'
    ? `<p class="tour-txt">${EN() ? sc.en : sc.tr}</p>`
    : `<div class="tour-bar"><i style="--d:${sc.ms}ms"></i></div>
    <p class="eyebrow">${Lx('Jüri turu', 'Jury tour')} · ${i + 1}/${n}</p>
    <p class="tour-txt">${EN() ? sc.en : sc.tr}</p>
    <button class="btn small" id="tour-stop">■ ${Lx('Turu durdur', 'Stop tour')}</button>`;
  document.getElementById('tour-stop')?.addEventListener('click', stopTour);
}

function stopTour() {
  tourOn = false;
  document.body.classList.remove('recording');
  tourTimers.forEach(clearTimeout);
  tourTimers = [];
  tourUI(0, 0, null);
}

async function startTour(mode: 'tour' | 'video' = 'tour', team = '') {
  stopTour();
  tourOn = true;
  tourMode = mode;
  document.body.classList.toggle('recording', mode === 'video');
  const scenes = mode === 'video' ? videoScenes(team || '[Team name]') : tourScenes();
  for (let i = 0; i < scenes.length && tourOn; i++) {
    tourUI(i, scenes.length, scenes[i]);
    const ran = scenes[i].run();
    await Promise.all([wait(scenes[i].ms), ran]);
  }
  stopTour();
  document.body.classList.remove('recording');
}

function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('lang') === 'en' || qs.get('lang') === 'tr') setLang(qs.get('lang') as 'tr' | 'en');
  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('[data-tour]');
    if (b) { ev.preventDefault(); startTour((b as HTMLElement).dataset.tour === 'video' ? 'video' : 'tour'); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && tourOn) stopTour(); });
  document.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) =>
    b.addEventListener('click', () => {
      S.body = b.dataset.body as 'mars' | 'ay';
      const first = doc.adaylar.find((c) => c.govde === S.body && c.enlem !== null);
      S.sel = cand(S.sel)?.govde === S.body ? S.sel : first?.aday_id ?? null;
      refreshMainMap();
      mainMap.setView(S.body === 'mars' ? [0, -120] : [10, 0], 2);
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => { setLang(b.dataset.lang as 'tr' | 'en'); refreshOverlays(); render(); }),
  );
  const nt = $('#navtoggle');
  nt.addEventListener('click', () => {
    const open = nt.getAttribute('aria-expanded') !== 'true';
    nt.setAttribute('aria-expanded', String(open));
    $('#nav').classList.toggle('open', open);
  });
  $('#nav').addEventListener('click', () => { nt.setAttribute('aria-expanded', 'false'); $('#nav').classList.remove('open'); });
  ($('#basemap-sel') as HTMLSelectElement).addEventListener('change', (ev) => {
    S.basemap = (ev.target as HTMLSelectElement).value as 'mola' | 'themis';
    refreshMainMap();
  });
  S.sel = 'MARS-01';
  initMainMap();
  refreshMainMap();
  window.addEventListener('hashchange', fromHash);
  fromHash();
  if (qs.has('video')) setTimeout(() => startTour('video', qs.get('team') ?? ''), 1500);
  else if (qs.has('tour') || qs.has('tur')) setTimeout(() => startTour(), 1200);
}

boot();
