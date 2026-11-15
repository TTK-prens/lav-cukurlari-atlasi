#!/usr/bin/env python3
"""Harita katmanları: MGC3 (Mars Global Cave Candidate Catalog) + lav tüpü kanıtları -> data/katmanlar.json

MGC3 kaynağı: USGS Astrogeology, Cushing (2017), PDS4 bundle
  urn:nasa:pds:mars_mro.odyssey_multi_cavecatalog_cushing_2016
  data/mgc3/Mars_Cave_Catalog.csv (zip içinden, değiştirilmeden kopyalandı)
NOT: CSV başlık satırı yanlış sıralı; gerçek sütunlar (Mars_Cave_Catalog.xml):
  ID_Tag, Longitude(0-360 D), Latitude, Type_Code, Priority, APC_Diameter(m), APC_Depth(m, gölgeden yaklaşık), Comment
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

TYPE = {  # MGC3 arşiv açıklaması, C-4
    "APC": ("Atipik çukur krater", "Atypical pit crater"),
    "sky": ("Lav tüpüne açılan skylight", "Skylight into a lava tube"),
    "srp": ("Küçük, sığ, yuvarlak kenarsız çökme çukuru", "Small shallow rimless collapse pit"),
    "smrp": ("Küçük kenarsız çukur", "Small rimless pit"),
    "crk": ("Derin, karanlık çatlak", "Deep dark crack or fracture"),
    "end": ("Kanal/çatlak/oluk ucunda", "At the distal end of a channel, fracture or trough"),
    "flr": ("Kanal/çatlak/oluk tabanında", "In the floor of a channel, fracture or trough"),
    "irr": ("Düzensiz biçim / diğer", "Irregular shape / other"),
    "kst": ("Karst tipi arazide", "In karst-type terrain"),
    "lat": ("Yanal giriş (genelde yarda)", "Lateral entrance (often in cliff walls)"),
    "pin": ("İğne deliği: birkaç piksellik keskin delik", "Pinhole: sharp hole a few pixels across"),
    "pit": ("Genel, şekilsiz çökme çukuru", "Generic amorphous collapse pit"),
    "pol": ("Kutup buzu bölgesinde", "In polar ice region"),
    "rim": ("Çukur/kanal/oluk kenarında", "On the rim of a pit, channel or trough"),
    "con": ("Bağlantılı tüp? (katalog notu)", "Connected tube? (catalog note)"),
}
PRIORITY = {  # MGC3 arşiv açıklaması, C-5 (öznel hedefleme önceliği)
    "0": ("0: en az bir HiRISE gözlemi zaten var (03/2017 itibarıyla)", "0: at least one HiRISE observation already exists (as of 03/2017)"),
    "1": ("1: yüksek öncelik (termal, CTX'te açık boşluk/overhang veya az örneklenmiş tip). En yüksek öncelikli olanların ~%25'i HiRISE'ta dik duvarlı çukur çıktı", "1: high priority (thermal, unambiguous void/overhang in CTX, or under-sampled type). ~25% of top-priority ones observed so far turned out to be steep-walled pits"),
    "2": ("2: CTX'te mağara girişine benziyor ama büyük olasılıkla mağara değil", "2: looks like a cave entrance in CTX but most likely is not"),
    "3": ("3: belirsiz; %80–90'ı büyük olasılıkla mağara özelliği göstermeyecek", "3: ambiguous; 80–90% will probably show no cave-like features"),
}


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def build():
    rows = []
    with (DATA / "mgc3" / "Mars_Cave_Catalog.csv").open(encoding="utf-8", errors="replace", newline="") as f:
        r = csv.reader(f)
        next(r)
        for row in r:
            if len(row) < 8:
                continue
            rid, lon, lat, typ, pri, dia, dep, com = row[:8]
            lon_f, lat_f = num(lon), num(lat)
            if lon_f is None or lat_f is None:
                continue
            rows.append({
                "id": rid, "lat": round(lat_f, 5), "lon": round(lon_f, 5),
                "lon180": round(lon_f - 360 if lon_f > 180 else lon_f, 5),
                "t": typ, "p": int(pri) if pri.isdigit() else None,
                "d": num(dia), "z": num(dep), "c": com,
            })
    tubes = []
    with (DATA / "tup_kanitlari.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            lat, lon = num(row["enlem"]), num(row["boylam"])
            row["enlem"], row["boylam"] = lat, lon
            row["boylam_180"] = None if lon is None else (lon - 360 if lon > 180 else lon)
            row["kaynak"] = row["kaynak"].split(";")
            tubes.append(row)
    doc = {
        "_aciklama": "scripts/build_layers.py tarafından üretildi.",
        "mgc3": {"tip": {k: {"tr": v[0], "en": v[1]} for k, v in TYPE.items()},
                 "oncelik": {k: {"tr": v[0], "en": v[1]} for k, v in PRIORITY.items()},
                 "kayitlar": rows},
        "tupler": tubes,
    }
    (DATA / "katmanlar.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return doc


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    d = build()
    print(f"katmanlar.json: MGC3 {len(d['mgc3']['kayitlar'])} kayıt, {len(d['tupler'])} tüp kanıtı")
