# 앱 아이콘(은박 호일 컵) 일괄 생성: 저장소 맨 위에서 `python3 tools/icon/make-icons.py`
# 필요: Python 3, playwright(+ chromium), Pillow, pyoxipng, imagequant(선택)  (pip install playwright pillow pyoxipng imagequant && playwright install chromium)
# 원본: tools/icon/A.svg(큰 크기용), tools/icon/A-small.svg(48px 이하용, 디테일을 줄이고 글자를 키움)
#   글자 윤곽은 SVG 안에 벡터로 들어 있음(쨈 제목 평면 v1.0.1 © 2026 JJAEM Font Team, fonttools로 추출, 곡선 구간을 매끄럽게 다듬음). 폰트 파일은 저장소에 넣지 않음.
# 만드는 파일(public/, 기존 파일 이름 그대로 덮어씀):
#   pwa-512.png, pwa-192.png                             ← A.svg, 둥근 사각형 + 투명 여백(Material 정사각 키라인 152/192, Windows·Linux는 마스크 없이 씀)
#   apple-touch-icon.png(180)                            ← A.svg, 꽉 찬 정사각형·투명 없음(모서리는 iOS가 깎음)
#   pwa-maskable-512.png, pwa-maskable.svg                ← A.svg를 90%로 줄여 뚜껑 모서리까지 80% 안전 원 안에 둠
#   favicon.svg, favicon.ico의 24/48                     ← A-small.svg, 기존처럼 둥근 모서리(rx 114/512)
#   favicon-16.png, favicon-32.png, favicon.ico의 16/32  ← 픽셀 격자에 맞춘 힌팅판(아래 G16·G32)
# SVG 필터(feSpecularLighting 등)를 정확히 그리려고 Chromium으로 1024px를 그린 뒤 Lanczos로 줄임.
import base64, io, pathlib, re
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
try:
    import oxipng
except ImportError:
    oxipng = None
try:
    import imagequant  # pngquant 엔진(libimagequant). 없으면 무손실로 저장
except ImportError:
    imagequant = None

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools' / 'icon'
PUB = ROOT / 'public'
BG_RECT = '<rect width="1024" height="1024" fill="url(#bg)"/>'

def maskable(svg):
    """배경은 그대로 두고 그림만 가운데 기준 90%로 줄임(최대 반지름 ≈345 < 안전 원 409.6)."""
    head, rest = svg.split(BG_RECT)
    body = rest.replace('</svg>', '')
    title = re.sub(r'<title>(.*?)</title>', lambda m: f'<title>{m.group(1)} (마스커블)</title>', head)
    # 바닥 그림자도 원 마스크에 잘리지 않게 좁고 짧게(안전 원 밖 그림자 알파 ≤ 3%)
    body = re.sub(r'<ellipse cx="512" cy="\d+" rx="\d+" ry="34"([^>]*filter="url\(#sh\)")', r'<ellipse cx="512" cy="836" rx="220" ry="26"\1', body)
    return f'{title}{BG_RECT}\n<g transform="translate(512 512) scale(.9) translate(-512 -512)">{body}</g>\n</svg>\n'

ANY_SCALE = 152 / 192  # Material 제품 아이콘 정사각 키라인(192 격자에서 152×152) → 바깥 여백 20/192 ≈ 10.4%

def any_purpose(svg):
    """purpose any(pwa-192·512): Windows·Linux Chrome/Edge는 마스크 없이 그대로 쓰므로 둥근 사각형 + 투명 여백.
    모서리는 파비콘과 같은 rx 228/1024, 크기는 Material 정사각 키라인 152/192(여백 10.4%)."""
    head, rest = svg.split(BG_RECT)
    body = rest.replace('</svg>', '')
    k = ANY_SCALE
    clip = '<clipPath id="anyclip"><rect width="1024" height="1024" rx="228"/></clipPath>'
    return (f'{head}<defs>{clip}</defs>\n<g transform="translate(512 512) scale({k:.6f}) translate(-512 -512)"><g clip-path="url(#anyclip)">'
            f'<rect width="1024" height="1024" rx="228" fill="url(#bg)"/>{body}</g></g>\n</svg>\n')

def rounded(svg, title='쨈 가계부'):
    """파비콘: 배경을 둥근 사각형(rx 228/1024 = 114/512)으로, 모서리는 투명."""
    svg = svg.replace(BG_RECT, '<rect width="1024" height="1024" rx="228" fill="url(#bg)"/>')
    return re.sub(r'<title>.*?</title>', f'<title>{title}</title>', svg)

def render(page, svg, size=1024):
    b64 = base64.b64encode(svg.encode()).decode()
    page.set_viewport_size({'width': size, 'height': size})
    page.set_content(f'<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,{b64}" width="{size}" height="{size}" style="display:block"></body></html>')
    page.evaluate("document.getElementById('i').decode()")
    page.wait_for_timeout(100)
    return Image.open(io.BytesIO(page.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size}))).convert('RGBA')

def down(im, s):
    return im.resize((s, s), Image.LANCZOS)

def save_png(im, path, quant=False):
    # quant=True: pngquant 품질 90-100, 디더링 없음(디더링하면 컵 몸통에 알갱이가 보임). 192·180에서 SSIM 0.997 이상 확인
    if quant and imagequant:
        im = imagequant.quantize_pil_image(im.convert('RGBA'), dithering_level=0.0, max_colors=256, min_quality=90, max_quality=100)
    im.save(path, optimize=True)
    if oxipng:
        oxipng.optimize(path, level=6, strip=oxipng.StripChunks.safe())

# 16·32px 힌팅판: 픽셀 격자에 맞춰 손으로 찍은 '쨈'(#=잉크, o=반 잉크). 탭 크기에서 흐려지지 않게 벡터 축소 대신 씀.
#   테두리 #8466FF: 밝은 탭(#FFFFFF 3.94:1, #DEE1E6 3.01:1)·어두운 탭(#35363A 3.06:1, #202124 4.08:1) 모두 3:1 이상
#   잉크 #1D2C86, 뚜껑은 밝은 은박(잉크 대비 7:1 이상)
#   16px: ㅐ의 짧은 가로획은 왼쪽 세로획에서 1px 나오고 오른쪽 세로획과 1px 띄움('H'로 안 보이게)
G16 = [
"................",
"................",
"................",
"..###.###.#..#..",
"...#...#..#..#..",
"..#.#.#.#.##.#..",
"..........#..#..",
"..........#..#..",
"................",
"...##########...",
"...#........#...",
"...#........#...",
"...##########...",
"................",
"................",
"................"]
G32 = [
"................................",
"................................",
"................................",
"................................",
"........................##......",
"......o####o.o####o.##..##......",
"......######.######.##..##......",
"........##.....##...##..##......",
"........##.....##...##..##......",
"........##.....##...##..##......",
"........##.....##...###.##......",
".......####...####..###.##......",
".......####...####..##..##......",
"......######.######.##..##......",
"......##..##.##..##.##..##......",
"......##..##.##..##.##..##......",
"....................##..##......",
"........................##......",
"................................",
"................................",
"......o##################o......",
"......####################......",
"......##................##......",
"......##................##......",
"......##................##......",
"......##................##......",
"......####################......",
"......o##################o......",
"................................",
"................................",
"................................",
"................................"]
assert all(len(r) == 16 for r in G16) and len(G16) == 16
assert all(len(r) == 32 for r in G32) and len(G32) == 32
RING = (0x84, 0x66, 0xFF)
INK = (0x1D, 0x2C, 0x86)

def hinted(grid, ring, tile_r, lid_r, lid_light=(0xF6, 0xF7, 0xFA), lid_dark=(0xC4, 0xCA, 0xD4)):
    """grid 크기 n: 둥근 바탕(테두리 ring px, 색 RING) + 은박 뚜껑 + 잉크 글자."""
    n = len(grid); k = 16; S = n * k
    def lerp(c0, c1, t): return tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
    # 모양(바탕·뚜껑)은 16배로 그려 BOX로 줄인 덮임 비율만 쓰고, 색은 n px에서 바로 칠함(Lanczos 번짐 없이 테두리 색을 정확히 유지)
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(tile_r * k), fill=255)
    m2 = Image.new('L', (S, S), 0); ImageDraw.Draw(m2).rounded_rectangle([ring * k, ring * k, (n - ring) * k - 1, (n - ring) * k - 1], radius=int(lid_r * k), fill=255)
    ta, la = m.resize((n, n), Image.BOX).load(), m2.resize((n, n), Image.BOX).load()
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    q = im.load()
    for y in range(n):
        for x in range(n):
            lidc = lerp(lid_light, lid_dark, (x + y) / (2 * n - 2))
            q[x, y] = lerp(RING, lidc, la[x, y] / 255) + (ta[x, y],)
    p = im.load()
    for y, r in enumerate(grid):
        for x, ch in enumerate(r):
            if ch == '#': p[x, y] = INK + (255,)
            elif ch == 'o': p[x, y] = lerp(p[x, y][:3], INK, .55) + (255,)
    return im

def hinted16(): return hinted(G16, 1, 3.5, 2.5)
def hinted32(): return hinted(G32, 2, 7, 5, lid_dark=(0xD0, 0xD5, 0xDE))

def main():
    big = (SRC / 'A.svg').read_text()
    small = (SRC / 'A-small.svg').read_text()
    mask_svg, fav_svg = maskable(big), rounded(small)
    (PUB / 'pwa-maskable.svg').write_text(mask_svg)
    (PUB / 'favicon.svg').write_text(fav_svg)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--disable-gpu', '--force-color-profile=srgb'])
        pg = b.new_page(device_scale_factor=1)
        full, mask, fav = render(pg, big), render(pg, mask_svg), render(pg, fav_svg)
        anyp = render(pg, any_purpose(big))
        b.close()
    save_png(down(anyp, 512), PUB / 'pwa-512.png')  # 투명 여백이 있는 RGBA, 무손실(512는 양자화하면 컵 몸통에 띠가 보임)
    save_png(down(anyp, 192), PUB / 'pwa-192.png', quant=True)
    save_png(down(full, 180).convert('RGB'), PUB / 'apple-touch-icon.png', quant=True)
    save_png(down(mask, 512).convert('RGB'), PUB / 'pwa-maskable-512.png')
    h16, h32 = hinted16(), hinted32()
    save_png(h32, PUB / 'favicon-32.png')
    save_png(h16, PUB / 'favicon-16.png')
    # Pillow ICO: 첫 그림보다 큰 크기는 버리므로 48을 앞에 둠
    fr = {s: down(fav, s) for s in (24, 48)}
    fr[48].save(PUB / 'favicon.ico', format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48)], append_images=[h16, fr[24], h32])
    print('done', 'oxipng' if oxipng else '(oxipng 없음: Pillow optimize만)')

if __name__ == '__main__':
    main()
