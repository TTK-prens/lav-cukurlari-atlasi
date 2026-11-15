# Ay ve Mars Lav Çukurları Atlası / Lunar & Martian Lava Pit Atlas

NASA Space Apps Challenge 2026 (14–15 Kasım). Ay ve Mars'taki lav çukuru / skylight adaylarını
Dünya'daki lav tüpleriyle **özellik özellik** eşleştiren, NASA Trek haritaları üzerinde çalışan statik web uygulaması.

Akış: **aday seç → Dünya ikizleri → neden benziyor / nerede benzemiyor → maliyet endeksi**.

## Çalıştırma

```bash
npm install && npm run dev
```

- `npm test` — eşleştirme, mesafe formülü ve Python↔TS tutarlılık testleri (vitest)
- `npm run build` — `dist/` (statik; `base: './'`, GitHub Pages / Vercel'e doğrudan yüklenir)
- `npm run data` — CSV'lerden `data/eslesme.json` üretir (Python 3.9+, ek paket yok); katmanlar için `python scripts/build_layers.py`
- `python -m unittest discover -s scripts -p "test_*.py"` — Python birim testleri

`data/eslesme.json` repoda tutulur; `npm run dev` için Python gerekmez.

## Plan (uygulanan)

1. İskelet: Vite + TypeScript + Leaflet, backend yok.
2. Mars verisi → NASA Mars Trek WMTS (MOLA renkli gölgeli, THEMIS Day IR) üzerinde, kanıt seviyesine göre harfli işaretçiler.
3. Eşleştirme (Python üretir, TS aynı formülle tablo/çapraz karşılaştırma yapar) + Dünya tohum verisi.
4. Maliyet paneli (bileşenler + ağırlık kaydırıcıları, "KABA TAHMİN").
5. Ay verisi: LROC Lunar Pits Atlas'tan 16 mare çukuru (takım tablosu gelince aynı şemayla değiştirilebilir).
6. Metodoloji, Kaynaklar, demo akışı, TR/EN.


## Sayfalar

| Adres | İçerik |
|---|---|
| `#/home` | Ana sayfa: amaç, neden çukur, 4 adımlık gezinme rehberi, öne çıkan bulgular, dürüstlük ilkeleri |
| `#/atlas` | NASA Trek haritası, aday listesi, detay paneli |
| `#/karsilastir` | Üçlü karşılaştırma (aday · Dünya ikizi · neden benziyor) |
| `#/siralama` | Ay ve Mars için üs uygunluk sıralaması (canlı ağırlıklar) |
| `#/maliyet` | Maliyeti azaltma stratejileri, kaldıraç hesaplayıcı, buz/regolit kalkan karşılaştırması |
| `#/gorev` | Mağara Üssü Görevi: gerçek adaylarla 10 haftalık, tohumlu görev simülasyonu (oyun modeli) |
| `#/ay-mars` | Ay ↔ Mars çapraz karşılaştırma |
| `#/metodoloji`, `#/kaynaklar` | Formüller ve kaynak tablosu |

Atlas, Karşılaştır, Sıralama ve Maliyet sayfalarının üstünde "1 → 4" adım çubuğu ve "Sonraki adım" düğmesi vardır.

**Üs sıralaması kuralı:** C seviyesi dışarıda; önce kanıt seviyesi (A > B), sonra temkinli endeks = endeks × kapsam (eksik bileşen 0 sayılır), sonra endeks.

## Mağara Üssü Görevi (oyun)

`src/game.ts` saf ve tohumlu bir modeldir (DOM yok); `src/game.test.ts` şunları test eder: aynı tohum aynı sonuç, A/B sahalarda NaN yok, makul strateji hiçbir şey yapmamaktan iyi, kazanma ve kaybetme mümkün, B sahada doğrulamadan yerleşilemez, Ay'da buz kazılamaz.

- **Atlastan gelenler:** kanıt seviyesi (C oynanamaz; A doğrulamayı atlar), derinlik, sarkık duvar, açık giriş, termal tampon, buz mesafesi, en iyi Dünya ikizi ve ortak özellik sayısı.
- **Kaynaklı kaldıraçlar:** buz kalkanı 1:3 (325 vs 975 mm), ~2 haftalık Ay gecesi, termal tampon yalnız veride "evet" olan yerde.
- **Tasarım seçimleri (soyut):** olay olasılıkları, hasar, kargo/enerji birimleri, puan. kg veya doz değildir; ekranda "oyun modeli, tahmin değil" yazar.
- Denge (100 tohum, makul strateji; 15 Kasım veri sürümü): Mare Tranquillitatis %100, Elysium batı yanağı %98, Mare Ingenii %94, Arsia adayları %70–88, Marius Hills %85, Lacus Mortis %75, Pavonis skylight %49 kazanma; hiçbir şey yapmamak her sahada kaybeder. Veri değişince `src/game.ts` ile yeniden ölçülmeli.

## Harita katmanları (yeni)

- **Lav tüpü kanıtları (≋):** `data/tup_kanitlari.csv` → Mare Tranquillitatis altı kanal (Mini-RF radar, Carrer 2024), Marius Hills (SELENE radar sondası, Kaku 2017 + GRAIL gravite, Chappaz 2017), Pavonis skylight altı ~90 m boşluk ve Olympus Mons kanal→tüp (HiRISE), Arsia "connected tube?" (MGC3). Tüp **hattı çizilmez**: kaynaklarda koordinatlı hat yok; yalnız kanıt noktası gösterilir.
- **MGC3 Mars mağara aday kataloğu:** USGS Astrogeology / PDS4 arşiv paketinden indirildi (`data/mgc3/`, 1062 kayıt). Öncelik 0–1 (439) veya tümü gösterilir; öncelik ve tip tanımları arşiv açıklama belgesinden (ör. öncelik 3'ün %80–90'ı büyük olasılıkla mağara değil). CSV başlık satırı yanlış sıralı; doğru sütunlar `Mars_Cave_Catalog.xml`'den alındı.
- `python scripts/build_layers.py` → `data/katmanlar.json`.

## Jüri turu ve 30 sn video modu

- Ana sayfadaki **▶ 60 sn jüri turu** düğmesi ya da `?tour=1`: 8 sahnelik otomatik tur (atlas → karşılaştır → Ay↔Mars → sıralama → maliyet → oyun).
- `?video=1&lang=en&team=TakimAdi`: Space Apps 2026 video şablonuna (≤30 sn, İngilizce altyazı) birebir uyan ~29 sn tur. Ayrıntı: `docs/VIDEO.md`, altyazı `docs/demo_video_en.srt`, slayt alternatifi `docs/SLIDES.md`.

## Kullanılan araçlar (Space Apps "References" bölümü için)

Vite, TypeScript, Leaflet, Vitest, Python; harita döşemeleri NASA Solar System Treks ve OpenStreetMap; geliştirme sırasında Anthropic Claude (kod ve araştırma yardımı). Videoda başka bir yapay zekâ aracı (ör. Gemini) kullanırsanız buraya ekleyin. NASA logosu kullanılmamıştır (marka kuralları sayfası bu oturumda okunamadı; yapay zekâ için açık bir kural bulunamadı, yalnız tüm araçların listelenmesi isteniyor).

## Veri akışı

```
Google Sheet sekmeleri ─(CSV export)─► data/ay_adaylari.csv
                                       data/mars_adaylari.csv
                                       data/dunya_tupleri.csv
                                       data/kaynaklar.csv  (kaynak kimlikleri)
        scripts/build_matches.py  ─►  data/eslesme.json  ─►  src/main.ts (Vite import)
```

- Ay ve Mars CSV'leri **aynı şemayı** kullanır (`aday_id, ad, govde, sinif, alt_tip, kanit_seviyesi, bolge, enlem, boylam, konum_tipi, cap_m, cap_tanimi, derinlik_m, derinlik_tipi, overhang, acik_giris, termal_tampon, termal_genlik_c, termal_not, kaynak_olcu, kaynak_konum, kaynak_termal, not`).
- Boş hücre = bilinmiyor (null). Aralıklar `88-100` biçiminde yazılır; hesapta orta nokta kullanılır, ekranda aralık gösterilir.
- `kaynak_*` sütunları `kaynaklar.csv` içindeki kimliklere işaret eder (`;` ile birden çok). UI her değerin yanında bu kimliği link olarak gösterir.
- Takım arkadaşının `ay_adaylari` tablosu gelince: sekmeyi CSV olarak `data/ay_adaylari.csv` üzerine yazın → `npm run data`.
- **Sözleşmeden sapmalar:** kayıtlar tek dosyada `{"adaylar": [...], "dunya": [...], "kaynaklar": [...]}` altında toplanır. `ozellikler.cap_m` / `derinlik_m` tek değerse sayı, aralıksa `null` + `cap_m_aralik: [min, max]`; ekran metni `*_metin` alanındadır. Mars derinlikleri çoğunlukla alt sınırdır (`derinlik_tipi: "en_az"`).
- `eslesme.json` sözleşmesindeki anahtarlar (`aday_id, govde, enlem, boylam, kanit_seviyesi, ozellikler{cap_m, derinlik_m, overhang, termal_genlik_c}, ikizler[{dunya_id, benzerlik, benzeyen_ozellikler, farklar}], benzemeyenler, maliyet{endeks, termal, su, kalkan, tugla, buz}`) korunmuştur; ek alanlar (`bant`, `guven`, `dD`, `konum_tipi`, `kaynak` …) yanlarına eklenmiştir.

## Metodoloji (özet — ayrıntı uygulamadaki "Metodoloji" sekmesinde)

- **Sınıf zorunlu:** lav ↔ lav, karst ↔ karst (Hebrus Valles yalnız karst Dünya satırlarıyla eşleşir).
- **Boyut skora girmez**, √g ölçeklemesi yok. Skor yalnız şekil ve davranış: d/D (0,35), sarkık duvar (0,20), skylight/açık giriş (0,15), termal tampon (0,30).
- `s_dD = max(0, 1 − |ln(a/b)| / ln 4)`; ikili özellikler aynıysa 1, farklıysa 0. Eksik özellik atlanır, ağırlık yeniden dağıtılır.
- **Güven bandı:** `kapsam = ortak ağırlık / toplam`, `bant = [skor·kapsam, skor·kapsam + (1−kapsam)]`. İkizler bandın **alt** sınırına göre sıralanır; ortak özellik yoksa skor `null` ("veri yok"), sıralanmaz.
- **Maliyet (KABA TAHMİN):** `mesafe_km ≈ max(0, (35 − enlem) × 59,2)` (yalnız Mars, kuzey 35°K SWIM referansı); `su = buz = max(0, 1 − mesafe/3000)`; `kalkan = min(1, derinlik/100)·0,8 + 0,2·[overhang]`; `termal = 1` yalnız termal tampon kanıtı varsa; `tuğla = 1` (lav sınıfı, adaylar arasında ayrım yapmaz). Endeks = ağırlıklı ortalama, null bileşen atlanır. Tonaj hesaplanmaz.

## Varsayımlar

- Ay kanıt seviyeleri: Mare Tranquillitatis çukuru **A** (Carrer ve ark. 2024 Mini-RF radar yeniden analizi); Marius Hills **A** (SELENE radar sondası, Kaku 2017 + GRAIL gravite, Chappaz 2017; yalnız künye ve arama özetiyle doğrulandı); LROC Atlas'ta sarkık duvarı "Y" olanlar **B**, diğerleri **C**.
- d/D: Ay için LROC Atlas **iç çukur** çapı (huni değil), Mars için **kenar** çapı. Mars derinlikleri çoğunlukla alt sınır (≥).
- Arsia "yedi kız kardeş" (Dena…Jeanne) için termal tampon = evet (Cushing ve ark. 2007, THEMIS). Annie "büyük oranda dolu" olduğu için açık giriş boş bırakıldı.
- Dünya `cap_m` yoksa karşılaştırma tablosunda geçit genişliği yıldızla gösterilir (aynı büyüklük değildir).
- Eşit skorda kaynak güveni yüksek Dünya satırı öne geçer (turizm kaynağı en sona).
- Dünya konumları yalnız harita gösterimi için OSM Nominatim'den alınmış yaklaşık noktalardır.

## Bu oturumda doldurulan/doğrulanan veriler (kaynaklı)

| Alan | Değer | Kaynak |
|---|---|---|
| 16 Ay mare çukuru (konum, huni/iç çap, derinlik, overhang) | `ay_adaylari.csv` | LROC Pits Atlas (278 sayfa okundu → `data/lroc_pits_atlas_scrape.json`) |
| Marius Hills | iç 49–55 m, huni 79–92 m, derinlik 40 m — takım notu (34 m / 65,9 m) ile **çelişiyor**, notta yazılı | LROC Atlas #1 |
| "Locus Mortis" | = Lacus Mortis Pit: huni 210–280 m, iç 110 m, derinlik 60 m, overhang Y | LROC Atlas #8 |
| Mare Tranquillitatis termal | gölgeli taban ~17 °C (yalnız bu çukur); yüzey ~127 / −173 °C | NASA LRO haberi, Horvath ve ark. 2022 GRL |
| Ay yüzeyi | gündüz >121 °C, gece −133 °C, kutup kraterleri <−246 °C | NASA Weather on the Moon |
| MARS-08 konum | 3.735°, 248.485°D (**görüntü merkezi**); enkaz tepesi kenarın 28 m altında, ilk boşluk ~90 m | HiRISE ESP_023531_1840 |
| MARS-12 | 28.5218°K 139.9275°D; L 386–396 m, W 298–301 m, D ~122–124 m, overhang (APC Tip I) | Sharma ve ark. 2025 AJ |
| MARS-13 / MARS-16 konum | 15.593/165.166 ve 18.376/231.633 (**görüntü merkezi**) | HiRISE |
| MARS-14 konum | 19.88°K 126.74°D — 325 km'lik vadinin **bölge merkezi**, skylight konumu değil | USGS Gazetteer |
| Devil's Throat (yeni Dünya satırı) | 2006: 50×42 m, ≥49 m derin, overhang yok | USGS HVO Volcano Watch |
| Carlsbad Caverns (karst satırı) | ortalama ~13 °C (56 °F) | NPS |
| Kazumura kesit | bazı yerlerde 21 m geniş, 18 m yüksek | Perkins 2020, PNAS (PMC7395488) |

## Kaynak doğrulama durumu

`kaynaklar.csv` içindeki tüm URL'ler bu oturumda tek tek denendi. DOI künyeleri (Cushing 2007, Sauro 2020, Carrer 2024, Horvath 2022, Hebrus/Sharma 2025) Crossref'ten, NTRS başlıkları ntrs.nasa.gov'dan doğrulandı. swim.psi.edu bu oturumda 523 döndü; Eos/OSM/USGS sayfaları otomatik istemciye 403 veriyor (USGS sayfası başka araçla okundu).

## Bilinen eksikler / doğrulanmamışlar

- **MGC3** eklendi (1062 kayıt) ama aday adaylarımızla tek tek eşleştirilmedi. Örnek tutarsızlık: Jeanne için MGC3'te APC075 'derinlik' alanı 345 m, Cushing 2007 değeri ≥75 m; bu yüzden MGC3 derinlikleri yalnız popup'ta "gölgeden yaklaşık" etiketiyle gösterilir, skora girmez. Abby/Nikki koordinat çakışması hâlâ açık.
- **Cushing ve ark. 2007** makale metni açılmadı; Arsia değerleri takım tablosundan.
- **Carrer ve ark. 2024** yalnız arama özeti/haberlerle doğrulandı; tam metin okunmadı.
- **Sauro ve ark. 2020** PDF'ine erişilemedi (403); ölçek oranları (Ay 300–700×, Mars ≤80×) açık erişimli Losarcos ve Dombard 2025 derlemesinden aktarıldı. PMC7395488 bir PNAS haber yazısıdır (Perkins), Sauro değildir.
- **Hebrus Valles (ApJL 2025)** yazar listesi ve skylight koordinatları doğrulanmadı; ölçü yok.
- **MARS-15** koordinatı bulunamadı (haritada yok, listede var). **Kazumura** için OSM konumu bulunamadı.
- **Ay su/buz bileşeni** hesaplanmadı (kaynaklı kutup buzu referansı eklenmedi) → Ay maliyet endeksi daha az bileşene dayanır (kapsam gösterilir).
- **SWIM** katmanı haritaya eklenmedi; buz mesafesi yalnız 35°K enlem referansıyla. Güney yarımküre kontrol edilmedi.
- `termal_genlik_c` hiçbir satırda dolu değil: Mars için mutlak/genlik değeri yayımlanmamış; Dünya mağaraları için genlik ölçümü bulunamadı. Sharma 2025 tablosundaki değerler **yüzey** parlaklık sıcaklığıdır, mağara sıcaklığı olarak kullanılmadı.
- Dünya d/D yalnız Devil's Throat için var (o da bir çukur krateri; tüp bağlantısı bilinmiyor). Bu yüzden çoğu eşleşme 2/4 özelliğe dayanır ve **orta** güvendedir. En çok değer katacak iş: Dünya skylight'larının (jameo, Kazumura/Undara çökmeleri) çap ve derinliklerini ölçen birincil kaynaklar.
- Takım notlarından gelen değerler (Undara, Cueva del Viento, Manjanggul, İzlanda tüpleri, Lanzarote, NTRS oranları, buz kalkanı 325/975 mm, ESA 3D baskı) `TAKIM-NOTU` olarak işaretli; birincil kaynakla tek tek doğrulanmalı. Lanzarote sıcaklığı yalnız turizm kaynaklı (düşük güven).
- Mars aday adları, çap tanımları ve termal notlar İngilizce de var (`*_en` sütunları). Dünya satırlarının uzunluk/boyut/sıcaklık metinleri ve serbest notlar yalnız Türkçe; EN modunda "Note (TR)" etiketiyle gösterilir.
- Arsia adayları ve Mare Tranquillitatis çukuru aynı en iyi ikizi (Raufarhólshellir) paylaşıyor, çünkü Dünya tarafında d/D ve sarkık duvar verisi yok. Uygulama bu eşitliği ekranda açıkça yazıyor.
- `public/img/` boş; görseller eklenene kadar yer tutucu görünür.
- Ay için yüksek çözünürlüklü (NAC) taban katman eklenmedi; LRO WAC ~zoom 8'den sonra büyütülür.
