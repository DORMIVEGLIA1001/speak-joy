import re, io, sys
p = r"src\components\AiTalkTab.tsx"
s = io.open(p, encoding="utf-8").read()

needle = '      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);'
i = s.find(needle)
print("found needle:", i)

# Find the start of startVisualizer body to the draw getByteFrequencyData line
start_marker = "  const startVisualizer = async () => {"
draw_marker = "        analyser" + "Ref.current.getByteFrequencyData(dataArray);\r\n"
si = s.find(start_marker)
di = s.find(draw_marker, si)
print("start idx:", si, "draw idx:", di)
print(repr(s[si:di+len(draw_marker)][:1200]))
