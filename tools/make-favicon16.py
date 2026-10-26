# 16px 파비콘 힌팅판 만들기: 저장소 맨 위에서 `python3 tools/make-favicon16.py` (Pillow, cairosvg 필요)
import io, cairosvg
from PIL import Image, ImageDraw
G = [  # 16x16 힌팅판 '쨈' (#=흰 획 1px, 픽셀 격자에 맞춤)
"................",
"................",
"..###.###.#..#..",
"...#...#..#..#..",
"..#.#.#.#.#..#..",
"..#.#.#.#.##.#..",
"..#.#.#.#.#..#..",
"..........#..#..",
".............#..",
"................",
"....##########..",
"....#........#..",
"....#........#..",
"....##########..",
"................",
"................"]
assert all(len(r)==16 for r in G) and len(G)==16
S=16*16
bg=Image.new('RGBA',(S,S),(0,0,0,0))
# 단색에 가까운 그라데이션(보라 #5E50F5 → 파랑 #3A64DE), 둥근 사각 rx 3.5px
grad=Image.new('RGBA',(S,S))
c0,c1=(0x5E,0x50,0xF5),(0x3A,0x64,0xDE)
px=grad.load()
for y in range(S):
  for x in range(S):
    t=(x+y)/(2*S-2); px[x,y]=tuple(round(a+(b-a)*t) for a,b in zip(c0,c1))+(255,)
mask=Image.new('L',(S,S),0); ImageDraw.Draw(mask).rounded_rectangle([0,0,S-1,S-1],radius=int(3.5*16),fill=255)
bg.paste(grad,(0,0),mask)
im=bg.resize((16,16),Image.LANCZOS)
p=im.load()
for y,r in enumerate(G):
  for x,ch in enumerate(r):
    if ch=='#': p[x,y]=(255,255,255,255)
im.save('public/favicon-16.png',optimize=True)
# ico: 16은 힌팅판, 24/32/48은 favicon.svg에서. Pillow는 첫 그림보다 큰 크기를 버리므로 48을 앞에 둠
svg=open('public/favicon.svg').read().encode()
fr=[Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg,output_width=s,output_height=s))).convert('RGBA') for s in (24,32,48)]
fr[2].save('public/favicon.ico',format='ICO',sizes=[(16,16),(24,24),(32,32),(48,48)],append_images=[im,fr[0],fr[1]])
