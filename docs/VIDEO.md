# 30 saniyelik demo videosu

Space Apps 2026 kuralı: demo **en fazla 30 saniye** bir video (İngilizce altyazılı) **veya** en fazla 7 slayt. Video YouTube veya Google Drive'a yüklenir ve bağlantı herkese açık olmalıdır. Gönderimden sonra düzenleme yapılamaz.
Resmi akış: 0:00 takım → 0:02 challenge → 0:05 proje adı ve slogan → 0:10 nasıl çalışıyor ve NASA verisi → 0:20–0:30 gelecek.

## 1. Siteyi video modunda aç (otomatik, ~29 sn)

```bash
npm run dev
```

Tarayıcıda şu adresi aç (`TakimAdi` yerine takımınızın adını yazın, boşluk yerine `%20`):

```
http://localhost:5173/?video=1&lang=en&team=TakimAdi#/home
```

- Sahneler kendi kendine geçer ve altta İngilizce altyazı çıkar. `Esc` turu durdurur.
- Kayıtta dikkat dağıtan rehber çubuğu ve zoom düğmeleri gizlenir.
- Tarayıcıyı **tam ekran (F11)** ve **1920×1080** yapın; dar pencerede mobil düzen açılır.

## 2. Ekranı kaydet

- **Windows:** `Win + Alt + R` (Xbox Game Bar) kaydı başlatır ve durdurur. Ya da ücretsiz OBS Studio kullanılabilir.
- Sayfayı yenileyip kaydı **hemen** başlatın; tur 1,5 sn sonra başlar.
- Videonun 30 saniyeyi geçmediğini kontrol edin; gerekirse baştaki ve sondaki fazlalığı kesin.

## 3. Altyazı

`docs/demo_video_en.srt` dosyası sahne metinleriyle birebir aynıdır. YouTube'da "Altyazılar → Dosya yükle" ile ekleyin. Altyazıyı videoya gömerseniz zorunluluk zaten karşılanır.
`[Team name]` yazan yeri kendi takım adınızla değiştirin.

## 4. Gemini (veya başka bir yapay zekâ) ile video üretmek isterseniz

Yardımcı olabilir ama **dikkat**:
- **Gerçek veri yerine AI görüntüsü koymayın.** Mars mağarası, Ay çukuru ya da harita görüntüsü üretmek, jüriye uydurma veri göstermek demektir. Projenin bütün gücü dürüstlük.
- AI'ı yalnız 1–2 saniyelik **sanatsal giriş** (ör. "kask kamerasından skylight'a iniş" konsepti) için kullanın. Ekrana açıkça **"AI-generated illustration / artist concept"** yazın.
- Asıl 0:10–0:20 bölümü mutlaka sitenin **gerçek ekran kaydı** olsun; NASA verisini gösteren kısım budur.
- Space Apps, projede kullanılan tüm veri, kaynak ve **araçların** listelenmesini istiyor. Gemini kullanırsanız proje sayfasındaki "References" bölümüne yazın.
- **NASA logosu (meatball) veya amblemini kullanmamanızı öneririz.** Space Apps marka kuralları sayfası bu oturumda okunamadı; emin olmak için spaceappschallenge.org'daki Brand Guidelines sayfasına bakın. "NASA Space Apps Challenge" adını metin olarak yazmak güvenli.
- Yapay zekâ kullanımıyla ilgili açık bir kural bulamadık; bulduğumuz tek şart, kullanılan tüm veri, kaynak ve araçların listelenmesi.

Gemini'ye örnek istem (yalnız giriş için):

> 3-second cinematic shot, astronaut helmet-cam view slowly descending through a dark circular skylight into a lunar lava tube, sunlight beam on dusty basalt floor, realistic, no text, no logos.

## 5. Video yerine slayt seçerseniz

`docs/SLIDES.md` dosyasında 7 slaytlık taslak var.
