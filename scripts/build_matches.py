#!/usr/bin/env python3
"""ay_adaylari.csv + mars_adaylari.csv + dunya_tupleri.csv  ->  data/eslesme.json

Kurallar (README / Metodoloji ile aynı):
  * Sınıf eşleşmesi zorunlu: lav <-> lav, karst <-> karst.
  * Boyut (çap, derinlik, uzunluk) benzerlik skoruna GİRMEZ (Sauro ve ark. 2020:
    Ay tüpleri 300-700 kat, Mars tüpleri 80 kata kadar büyük olabilir; Losarcos & Dombard 2025). Yalnız şekil ve davranış:
      dD        derinlik/çap oranı      ağırlık 0.35
      overhang  sarkık duvar            ağırlık 0.20
      acik_giris skylight / açık giriş  ağırlık 0.15
      termal    termal tampon davranışı ağırlık 0.30
  * null özellik atlanır, ağırlık ortak özelliklere yeniden dağıtılır.
  * Güven bandı: kapsam = ortak ağırlık / toplam ağırlık
        alt = skor*kapsam ; üst = skor*kapsam + (1-kapsam)
    İkizler ALT sınıra göre sıralanır (az kanıtlı mükemmel skor öne geçemez).
  * Ortak özellik yoksa benzerlik = null, sıralanmaz.
Uydurma değer yok: CSV'de boş olan her şey null kalır.
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

WEIGHTS = {"dD": 0.35, "overhang": 0.20, "acik_giris": 0.15, "termal": 0.30}
DD_LOG_SCALE = math.log(4)  # oran 4 kat farklıysa benzerlik 0
KM_PER_DEG_MARS = 59.2      # 2*pi*3389.5/360 ≈ 59.16 km
ICE_REF_LAT_MARS = 35.0     # SWIM: haritalanmış en alçak enlemli buz ~35°K (yalnız kuzey)
ICE_DIST_SCALE_KM = 3000.0  # su bileşeni = 1 - mesafe/3000 (KABA)

# eşit skorda kaynak güveni yüksek olan Dünya satırı öne geçer (turizm kaynağı en sona)
GUVEN_RANK = {"yuksek": 5, "orta-yuksek": 4, "orta": 3, "": 2, "dusuk-orta": 1, "dusuk": 0}

FEATURE_LABEL = {
    "dD": "derinlik/çap (d/D)",
    "overhang": "sarkık duvar (overhang)",
    "acik_giris": "skylight / açık giriş",
    "termal": "termal tampon davranışı",
}


# ---------------------------------------------------------------- yardımcılar
def parse_range(s: str | None) -> tuple[float, float] | None:
    """'88-100' -> (88,100); '162' -> (162,162); '' -> None"""
    if s is None:
        return None
    s = str(s).strip().replace(",", ".").replace("–", "-")
    if not s:
        return None
    parts = [p for p in s.split("-") if p.strip()]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    return (min(vals), max(vals))


def mid(r):
    return None if r is None else (r[0] + r[1]) / 2


def yesno(s: str | None):
    s = (s or "").strip().lower()
    if s.startswith("evet"):
        return True
    if s.startswith("hayir") or s.startswith("hayır"):
        return False
    return None


def read_csv(name: str) -> list[dict]:
    p = DATA / name
    with p.open(encoding="utf-8", newline="") as f:
        return [{k: (v if v != "" else None) for k, v in row.items()} for row in csv.DictReader(f)]


def lon180(lon):
    if lon is None:
        return None
    return lon - 360 if lon > 180 else lon


def dd_ratio(row) -> float | None:
    """d/D = derinlik / çap (orta noktalar). Derinlik 'en_az' ise oran da alt sınırdır."""
    cap = mid(parse_range(row.get("cap_m")))
    dep = mid(parse_range(row.get("derinlik_m")))
    if row.get("derinlik_tipi") == "en_fazla_tavan_kalinligi":
        return None  # tavan kalınlığı çukur derinliği değildir
    if not cap or dep is None:
        return None
    return dep / cap


def features(row) -> dict:
    return {
        "dD": dd_ratio(row),
        "overhang": yesno(row.get("overhang")),
        "acik_giris": yesno(row.get("acik_giris")),
        "termal": yesno(row.get("termal_tampon")),
    }


# ---------------------------------------------------------------- eşleştirme
def feature_sim(key: str, a, b) -> float | None:
    if a is None or b is None:
        return None
    if key == "dD":
        if a <= 0 or b <= 0:
            return None
        return max(0.0, 1.0 - abs(math.log(a / b)) / DD_LOG_SCALE)
    return 1.0 if a == b else 0.0


def compare(fa: dict, fb: dict) -> dict:
    """Özellik özellik karşılaştırma. TS tarafı (src/match.ts) bunu birebir uygular."""
    per = {}
    num = 0.0
    wsum = 0.0
    for k, w in WEIGHTS.items():
        s = feature_sim(k, fa.get(k), fb.get(k))
        per[k] = s
        if s is not None:
            num += w * s
            wsum += w
    total = sum(WEIGHTS.values())
    if wsum == 0:
        return {"benzerlik": None, "alt": None, "ust": None, "kapsam": 0.0,
                "ortak_ozellik": 0, "ozellik": per, "guven": "yok"}
    score = num / wsum
    cov = wsum / total
    n = sum(1 for v in per.values() if v is not None)
    guven = "yuksek" if n == 4 else "orta" if n >= 2 else "dusuk"
    return {
        "benzerlik": round(score, 3),
        "alt": round(score * cov, 3),
        "ust": round(score * cov + (1 - cov), 3),
        "kapsam": round(cov, 3),
        "ortak_ozellik": n,
        "ozellik": {k: (None if v is None else round(v, 3)) for k, v in per.items()},
        "guven": guven,
    }


def fmt(k, v):
    if v is None:
        return "veri yok"
    if k == "dD":
        return f"{v:.2f}"
    return "evet" if v else "hayır"


def explain(fa, fb, res, aday, dunya):
    benzer, fark = [], []
    for k in WEIGHTS:
        s = res["ozellik"][k]
        a, b = fa.get(k), fb.get(k)
        lab = FEATURE_LABEL[k]
        if s is None:
            continue
        txt = f"{lab}: {fmt(k, a)} ↔ {fmt(k, b)}"
        (benzer if s >= 0.6 else fark).append(txt)
    # ölçek farkı: skora girmez ama her zaman yazılır
    cap = mid(parse_range(aday.get("cap_m")))
    dg = dunya.get("cap_m") or dunya.get("gecit_genislik_m")
    dgv = mid(parse_range(dg))
    if cap and dgv:
        fark.append(f"ölçek: aday ~{cap:.0f} m ↔ Dünya ~{dgv:.0f} m (skora dahil değil; Ay tüpleri 300–700 kat, Mars tüpleri 80 kata kadar büyük olabilir — Sauro ve ark. 2020; Losarcos ve Dombard 2025)")
    else:
        fark.append("ölçek: Dünya tüpleri Ay/Mars adaylarından çok daha küçük (skora dahil değil; Sauro ve ark. 2020; Losarcos ve Dombard 2025)")
    return benzer, fark


def ice_distance_km(lat: float | None, govde: str):
    """KABA: yalnız Mars, yalnız kuzey 35°K referansı. Güney yarımküre kontrol edilmedi."""
    if govde != "mars" or lat is None:
        return None
    return max(0.0, (ICE_REF_LAT_MARS - lat) * KM_PER_DEG_MARS)


def cost(row, f) -> dict:
    """Maliyet bileşenleri (0-1, KABA TAHMİN). Ağırlıklı endeks UI'da kaydırıcılarla hesaplanır;
    burada eşit ağırlıklı varsayılan endeks verilir."""
    lat = row["_lat"]
    govde = row["govde"]
    # termal: tampon kanıtı 1, kanıt yok/bilinmiyor null (uydurma yok)
    termal = 1.0 if f["termal"] else None
    d = ice_distance_km(lat, govde)
    su = None if d is None else round(max(0.0, 1 - d / ICE_DIST_SCALE_KM), 3)
    dep = parse_range(row.get("derinlik_m"))
    kalkan = None
    if dep is not None:
        kalkan = min(1.0, dep[0] / 100.0) * 0.8 + (0.2 if f["overhang"] else 0.0)
        kalkan = round(min(1.0, kalkan), 3)
    # tuğla: her iki gövdede yerel bazaltik regolit var; adaylar arasında ayrım yapmaz (nitel)
    tugla = 1.0 if row.get("sinif") == "lav" else None
    buz = su  # buzdan eşya üretimi buz yakınlığına bağlı
    comps = {"termal": termal, "su": su, "kalkan": kalkan, "tugla": tugla, "buz": buz}
    vals = [v for v in comps.values() if v is not None]
    endeks = round(sum(vals) / len(vals), 3) if vals else None
    return {"endeks": endeks, **comps, "buz_mesafe_km": None if d is None else round(d)}


def single(s):
    r = parse_range(s)
    return r[0] if r and r[0] == r[1] else None


def rng(s):
    r = parse_range(s)
    return list(r) if r else None


def num(s):
    try:
        return float(s) if s is not None else None
    except ValueError:
        return None


def build():
    ay = read_csv("ay_adaylari.csv")
    mars = read_csv("mars_adaylari.csv")
    dunya = read_csv("dunya_tupleri.csv")
    for d in dunya:
        d["_f"] = features(d)
    dmap = {d["dunya_id"]: d for d in dunya}
    out = []
    for row in ay + mars:
        lat, lon = num(row.get("enlem")), num(row.get("boylam"))
        row["_lat"] = lat
        fa = features(row)
        twins = []
        for d in dunya:
            if d.get("sinif") != row.get("sinif"):
                continue  # sınıf eşleşmesi zorunlu
            res = compare(fa, d["_f"])
            benzer, fark = explain(fa, d["_f"], res, row, d)
            twins.append({
                "dunya_id": d["dunya_id"],
                "benzerlik": res["benzerlik"],
                "bant": [res["alt"], res["ust"]] if res["benzerlik"] is not None else None,
                "guven": res["guven"],
                "ortak_ozellik": res["ortak_ozellik"],
                "ozellik_skor": res["ozellik"],
                "benzeyen_ozellikler": benzer,
                "farklar": fark,
            })
        ranked = sorted([t for t in twins if t["benzerlik"] is not None],
                        key=lambda t: (-t["bant"][0], -t["benzerlik"], -GUVEN_RANK.get((dmap[t["dunya_id"]].get("sicaklik_guven") or "").split(" ")[0], 2), t["dunya_id"]))
        unranked = [t for t in twins if t["benzerlik"] is None]
        missing = [FEATURE_LABEL[k] + ": veri yok" for k, v in fa.items() if v is None]
        top_diff = ranked[0]["farklar"] if ranked else []
        out.append({
            "aday_id": row["aday_id"],
            "ad": row.get("ad"),
            "ad_en": row.get("ad_en"),
            "govde": row["govde"],
            "sinif": row.get("sinif"),
            "alt_tip": row.get("alt_tip"),
            "bolge": row.get("bolge"),
            "enlem": lat,
            "boylam": lon,
            "boylam_180": lon180(lon),
            "konum_tipi": row.get("konum_tipi"),
            "kanit_seviyesi": row.get("kanit_seviyesi"),
            "ozellikler": {
                # sözleşme: tek değer -> sayı; aralık -> null + *_aralik [min, max]; *_metin ekran içindir
                "cap_m": single(row.get("cap_m")),
                "cap_m_aralik": rng(row.get("cap_m")),
                "cap_m_metin": row.get("cap_m"),
                "cap_tanimi": row.get("cap_tanimi"),
                "cap_tanimi_en": row.get("cap_tanimi_en"),
                "derinlik_m": single(row.get("derinlik_m")),
                "derinlik_m_aralik": rng(row.get("derinlik_m")),
                "derinlik_m_metin": row.get("derinlik_m"),
                "derinlik_tipi": row.get("derinlik_tipi"),
                "dD": None if fa["dD"] is None else round(fa["dD"], 3),
                "overhang": fa["overhang"],
                "acik_giris": fa["acik_giris"],
                "termal_tampon": fa["termal"],
                "termal_genlik_c": num(row.get("termal_genlik_c")),
                "termal_not": row.get("termal_not"),
                "termal_not_en": row.get("termal_not_en"),
            },
            "kaynak": {
                "olcu": (row.get("kaynak_olcu") or "").split(";") if row.get("kaynak_olcu") else [],
                "konum": (row.get("kaynak_konum") or "").split(";") if row.get("kaynak_konum") else [],
                "termal": (row.get("kaynak_termal") or "").split(";") if row.get("kaynak_termal") else [],
            },
            "not": row.get("not"),
            "ikizler": ranked + unranked,
            "benzemeyenler": missing + top_diff,
            "maliyet": cost(row, fa),
        })
    dunya_out = []
    for d in dunya:
        dunya_out.append({k: v for k, v in d.items() if not k.startswith("_")} | {
            "enlem": num(d.get("enlem")), "boylam": num(d.get("boylam")),
            "ozellik": {k: (None if v is None else (round(v, 3) if isinstance(v, float) else v)) for k, v in d["_f"].items()},
        })
    kaynaklar = read_csv("kaynaklar.csv")
    doc = {
        "_aciklama": "scripts/build_matches.py tarafından üretildi. Elle düzenlemeyin; CSV'leri düzenleyip yeniden çalıştırın.",
        "agirliklar": WEIGHTS,
        "adaylar": out,
        "dunya": dunya_out,
        "kaynaklar": kaynaklar,
    }
    (DATA / "eslesme.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    doc = build()
    print(f"eslesme.json: {len(doc['adaylar'])} aday, {len(doc['dunya'])} Dünya satırı")
    for a in doc["adaylar"][:3] + [x for x in doc["adaylar"] if x["aday_id"] in ("MARS-01", "MARS-11", "MARS-14")]:
        t = a["ikizler"][0] if a["ikizler"] else None
        print(a["aday_id"], a["ad"], "->", t and (t["dunya_id"], t["benzerlik"], t["bant"], t["guven"]), "| maliyet", a["maliyet"]["endeks"])
