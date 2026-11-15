import io, subprocess, sys, json
from PIL import Image
V, approx = sys.argv[1], float(sys.argv[2])
def cap(t):
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", V, "-frames:v", "1", "-vf", "crop=900:70:510:980",
                        "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
    im = Image.open(io.BytesIO(b)).convert("L")
    return sum(1 for p in im.tobytes() if p > 200)
def edge(a, b, want_on):
    t = a
    while t <= b:
        if (cap(t) > 300) == want_on:
            return round(t, 2)
        t += 0.05
start = edge(approx - 1.5, approx + 1.5, True)
end = edge(start + 27, start + 31, False)
print(json.dumps({"start": start, "end": end, "dur": round(end - start, 2)}))
