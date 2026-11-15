import json, subprocess, sys, glob, os
from pathlib import Path
REC = Path(sys.argv[1])           # kayıt klasörü (webm, caps.json, edges.json)
TTS = Path(sys.argv[2])           # trim{i}.wav
OUT_MP4 = Path(sys.argv[3])
OUT_SRT = Path(sys.argv[4])
video = glob.glob(str(REC / "*.webm"))[0]
caps = [c for c in json.load(open(REC / "caps.json"))]
e = json.load(open(REC / "edges.json"))
t0 = [c for c in caps if c["txt"]][0]["t"]
page = [(round((c["t"] - t0) / 1000, 3), c["txt"]) for c in caps]
page_dur = page[-1][0]
scale = e["dur"] / page_dur
LEAD = 0.10
TS = e["start"] - LEAD
TE = e["end"] + 0.10
starts = [(e["start"] - TS) + t * scale for t, txt in page]   # yeni videodaki zaman
lines = [txt for t, txt in page if txt]

def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
srt = []
for i, txt in enumerate(lines):
    srt.append(f"{i+1}\n{ts(starts[i])} --> {ts(starts[i+1])}\n{txt}\n")
OUT_SRT.write_text("\n".join(srt), encoding="utf-8")

inputs = ["-ss", f"{TS:.3f}", "-to", f"{TE:.3f}", "-i", video]
filt = []
for i in range(len(lines)):
    inputs += ["-i", str(TTS / f"trim{i}.wav")]
    d = int(round((starts[i] + 0.05) * 1000))
    filt.append(f"[{i+1}:a]adelay={d}|{d},aformat=sample_rates=48000:channel_layouts=stereo[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(lines)))
filt.append(f"{mix}amix=inputs={len(lines)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]")
inputs += ["-i", str(OUT_SRT)]
sub_idx = len(lines) + 1
cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filt),
       "-map", "0:v", "-map", "[aout]", "-map", f"{sub_idx}:s",
       "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "19",
       "-c:a", "aac", "-b:a", "160k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
       "-t", f"{TE-TS:.3f}", "-movflags", "+faststart", str(OUT_MP4)]
OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stderr[-2000:])
print(json.dumps({"duration": round(TE - TS, 2), "scale": round(scale, 4), "starts": [round(x, 2) for x in starts]}))
