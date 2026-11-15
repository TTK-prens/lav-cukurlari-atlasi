# Demo videosunu yeniden üretmek

Çıktı: `video/Milestone_LavaPitAtlas_demo.mp4` (~28,9 sn, 1920×1080, Windows "Zira" sesiyle İngilizce anlatım, gömülü İngilizce altyazı izi) ve `docs/demo_video_en.srt`.

Gerekenler: Windows, Microsoft Edge, ffmpeg, Python + Pillow, Node. Kayıt aracı projeye eklenmez; ayrı bir klasöre kurulur:

```bash
mkdir rec && cd rec && npm init -y && npm i playwright-core@1.48.2 && npx playwright-core install ffmpeg
```

1. Siteyi derle ve yerelde sun: `npm run build` ve ardından `npx vite preview --port 5181`.
2. Kaydet: `node record.mjs ./out http://localhost:5181/`. Edge görünmez modda `?video=1&lang=en&team=Milestone` turunu kaydeder; her altyazı değişiminin zamanı `out/caps.json` dosyasına yazılır.
3. Seslendirme: `powershell -File tts.ps1 -OutDir ./tts -Rate 2`. Ardından her `lineN.wav` dosyasının baştaki ve sondaki sessizliği ffmpeg `silenceremove` ile kırpılıp `trimN.wav` yapılır.
4. Altyazının videodaki başlangıç/bitiş anı: `python edges.py out/<kayıt>.webm <timing.json start_s>`; çıktıyı `out/edges.json` dosyasına kaydedin.
5. Birleştir: `python make_video.py ./out ./tts ../video/Milestone_LavaPitAtlas_demo.mp4 ../docs/demo_video_en.srt`

Sahne süreleri (`src/main.ts` → `videoScenes`), seslendirmenin sessizlik kırpılmış uzunluklarına göre ayarlıdır. Metni değiştirirseniz sesi yeniden üretip süreleri güncelleyin; toplam süre 30 saniyeyi geçmemeli.
