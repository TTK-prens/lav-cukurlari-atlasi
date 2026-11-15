#!/usr/bin/env python3
"""Görselleri indirir, küçültür ve atıf bilgisini data/gorseller.json'a yazar.

Yalnız lisansı açık kaynaklar:
  * Wikimedia Commons (CC BY / CC BY-SA / CC0 / kamu malı) — atıf ve lisans Commons API'den okunur.
  * HiRISE (uahirise.org): kamu malı; "NASA/JPL/University of Arizona" atfı istenir.
Çalıştırma: python scripts/fetch_images.py   (Pillow gerekir)
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "img"
UA = {"User-Agent": "lava-pit-atlas-hackathon/0.1 (educational project; NASA Space Apps)"}

COMMONS = {
    # Dünya
    "E-01": "File:Kazumura collapsed floor.jpg",
    "E-02": "File:Undara Lava Tubes.JPG",
    "E-03": "File:Cueva del Viento Icod de los Vinos.jpg",
    "E-04": "File:Lanzarote 5 Luc Viatour.jpg",
    "E-05": "File:Manjanggul Lava tube.jpg",
    "E-06": "File:Inside-surtshellir.jpg",
    "E-07": "File:IS cave vidgelmir.jpeg",
    "E-08": "File:Raufarhólshellir, Iceland, 20230502 1203 4152.jpg",
    "E-09": "File:Ape Cave at Mount St. Helens National Volcanic Monument in Washington 1.jpg",
    "E-10": "File:Lava river cave oregon.jpg",
    "E-11": "File:Lava Beds Cave collapse trench.jpg",
    "E-12": "File:Devil's throat pit crater.jpg",
    "E-13": "File:Big Room, Carlsbad Cavern (51234085016).jpg",
    # Ay (NASA/GSFC/Arizona State University — LROC)
    "AY-01": "File:Mare Tranquillitatis pit crater.jpg",
    "AY-02": "File:Marius Hills Pit - Lava Tube Skylight? (LROC202 - M114328462R enlargement).png",
    "AY-04": "File:Mare Ingenii presumed lava tube skylight.jpg",
    "AY-05": "File:Lacus Mortis pit.png",
    # Mars: Arsia'nın 7 skylight adayı tek etiketli görüntüde
    "ARSIA7": "File:Mars caves from NASA orbiters.jpg",
}
# NASA açıklaması: (A) Dena, (B) Chloe, (C) Wendy, (D) Annie, (E) Abby (sol, "1") ve Nikki ("2"), (F) Jeanne
ARSIA_PANEL = {"MARS-01": "A", "MARS-02": "B", "MARS-03": "C", "MARS-04": "D", "MARS-05": "E-1", "MARS-06": "E-2", "MARS-07": "F"}
SHARED = {k: "ARSIA7" for k in ARSIA_PANEL}

HIRISE = {
    "MARS-08": "ESP_023531_1840",
    "MARS-09": "ESP_019351_1795",
    "MARS-10": "ESP_043443_1685",
    "MARS-11": "ESP_043222_2035",
    "MARS-12": "ESP_042629_2090",
    "MARS-13": "ESP_092989_1960",
    "MARS-16": "ESP_020090_1985",
}


def strip(h):
    return re.sub(r"<[^>]+>", "", h or "").strip()


def fetch(url: str) -> bytes:
    for attempt in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("unreachable")


def save_url(url: str, name: str) -> str:
    """Dosya zaten varsa yeniden indirmez (Commons hız sınırı)."""
    if (OUT / f"{name}.jpg").exists():
        return f"{name}.jpg"
    return save(fetch(url), name)


def save(data: bytes, name: str) -> str:
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    im.thumbnail((1000, 1000))
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.jpg"
    im.save(path, "JPEG", quality=82, optimize=True, progressive=True)
    return f"{name}.jpg"


def commons_info(titles):
    out = {}
    for i in range(0, len(titles), 10):
        chunk = titles[i:i + 10]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "|".join(chunk), "prop": "imageinfo",
                                    "iiprop": "url|extmetadata", "iiurlwidth": 1000})
        r = json.loads(fetch("https://commons.wikimedia.org/w/api.php?" + q))
        norm = {n["to"]: n["from"] for n in r["query"].get("normalized", [])}
        for p in r["query"]["pages"].values():
            ii = p["imageinfo"][0]
            m = ii["extmetadata"]
            out[norm.get(p["title"], p["title"])] = {
                "thumb": ii.get("thumburl") or ii["url"],
                "source_url": ii["descriptionurl"],
                "license": strip(m.get("LicenseShortName", {}).get("value")),
                "license_url": strip(m.get("LicenseUrl", {}).get("value")) or None,
                "credit": strip(m.get("Artist", {}).get("value")),
                "desc": strip(m.get("ImageDescription", {}).get("value"))[:240],
            }
        time.sleep(3)
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    meta: dict[str, dict] = {}
    info = commons_info(list(COMMONS.values()))
    for key, title in COMMONS.items():
        i = info[title]
        fn = save_url(i["thumb"], key.lower())
        meta[key] = {"file": fn, "credit": i["credit"], "license": i["license"], "license_url": i["license_url"],
                     "source": "Wikimedia Commons", "source_url": i["source_url"], "desc": i["desc"]}
        print("ok", key, i["license"], "|", i["credit"][:40])
        time.sleep(2)
    for cid, ref in SHARED.items():
        meta[cid] = {**meta[ref], "shared": True, "panel": ARSIA_PANEL[cid]}
    for cid, obs in HIRISE.items():
        page = fetch(f"https://www.uahirise.org/{obs}").decode("utf-8", "replace")
        m = re.search(rf"https?://static\.uahirise\.org/images/\d+/details/cut/{obs}\.jpg", page) or \
            re.search(rf"https?://static\.uahirise\.org/images/\d+/details/{obs}\.jpg", page)
        title = re.search(r"<title>\s*HiRISE \|\s*(.*?)</title>", page, re.S)
        if not m:
            print("YOK", cid, obs); continue
        fn = save_url(m.group(0), cid.lower())
        meta[cid] = {"file": fn, "credit": "NASA/JPL/University of Arizona", "license": "Public domain (HiRISE image use policy)",
                     "license_url": "https://www.uahirise.org/media/usage.php", "source": "HiRISE",
                     "source_url": f"https://www.uahirise.org/{obs}", "desc": (title.group(1).strip() if title else obs)}
        print("ok", cid, obs)
        time.sleep(1)
    (ROOT / "data" / "gorseller.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(meta), "görsel kaydı")


if __name__ == "__main__":
    main()
