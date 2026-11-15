param([string]$OutDir, [int]$Rate = 1)
Add-Type -AssemblyName System.Speech
# Altyazı ile birebir aynı metinler (yalnız LROC harf harf okunsun diye boşluklu)
$lines = @(
  'Hi, we are team Milestone.',
  'Our challenge: find places on Earth that resemble base sites on the Moon and Mars.',
  'Lava Pit Atlas: the first base could be built inside a lava pit.',
  'We map 32 candidate pits on the Moon and Mars with NASA Trek, L R O C and HiRISE data,',
  'and match each to Earth lava tubes, feature by feature.',
  'Best Mars candidate: Elysium, about 384 kilometers from mapped ice.',
  'Next: rehearse on Earth, then build with local ice and regolith.',
  'Every number is sourced. No Mars cave is confirmed yet.'
)
New-Item -ItemType Directory -Force $OutDir | Out-Null
for ($i = 0; $i -lt $lines.Count; $i++) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Zira Desktop')
  $s.Rate = $Rate
  $f = Join-Path $OutDir ("line{0}.wav" -f $i)
  $s.SetOutputToWaveFile($f)
  $s.Speak($lines[$i])
  $s.Dispose()
}
'done'
