# 앱 아이콘(은박 호일 컵) 일괄 생성: 저장소 맨 위에서 `python3 tools/icon/make-icons.py`
# 필요: Python 3, playwright(+ chromium), Pillow, pyoxipng  (pip install playwright pillow pyoxipng && playwright install chromium)
# 원본: tools/icon/A.svg(큰 크기용), tools/icon/A-small.svg(48px 이하용, 디테일을 줄이고 글자를 키움)
#   글자 윤곽은 SVG 안에 벡터로 들어 있음(쨈 제목 평면 v1.0.1 © 2026 JJAEM Font Team, fonttools로 추출). 폰트 파일은 저장소에 넣지 않음.
# 만드는 파일(public/, 기존 파일 이름 그대로 덮어씀):
#   pwa-512.png, pwa-192.png, apple-touch-icon.png(180)  ← A.svg, 꽉 찬 정사각형·투명 없음(모서리는 OS가 깎음)
#   pwa-maskable-512.png, pwa-maskable.svg                ← A.svg를 90%로 줄여 뚜껑 모서리까지 80% 안전 원 안에 둠
#   favicon.svg, favicon-32.png, favicon.ico(16/24/32/48) ← A-small.svg, 기존처럼 둥근 모서리(rx 114/512)
#   favicon-16.png, favicon.ico의 16                     ← 픽셀 격자에 맞춘 힌팅판(아래 G16)
# tools/icon/preview.png: 기존 vs 새 아이콘 비교(마스크·작은 크기·홈 화면·탭), 생성 결과 확인용
# SVG 필터(feSpecularLighting 등)를 정확히 그리려고 Chromium으로 1024px를 그린 뒤 Lanczos로 줄임.
import base64, io, pathlib, re
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
try:
    import oxipng
except ImportError:
    oxipng = None

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

def save_png(im, path):
    im.save(path, optimize=True)
    if oxipng:
        oxipng.optimize(path, level=6, strip=oxipng.StripChunks.safe())

# 16px 힌팅판: 보라 둥근 바탕 + 은박 뚜껑(1~14px) + 남색 잉크 '쨈'(#=잉크 1px, o=반 잉크)
G16 = [
"................",
"................",
"................",
"...###.###.#.#..",
"....#...#..#.#..",
"...#.#.#.#.###..",
"...........#.#..",
"...........#.#..",
"................",
"....#########...",
"....#.......#...",
"....#.......#...",
"....#########...",
"................",
"................",
"................"]
assert all(len(r) == 16 for r in G16) and len(G16) == 16

def hinted16():
    S = 16 * 16
    def lerp(c0, c1, t): return tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
    bg = Image.new('RGBA', (S, S))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = lerp((0x7A, 0x5C, 0xFA), (0x4A, 0x2C, 0xD0), (x + y) / (2 * S - 2)) + (255,)
    lid = Image.new('RGBA', (S, S))
    lp = lid.load()
    for y in range(S):
        for x in range(S):
            lp[x, y] = lerp((0xF6, 0xF7, 0xFA), (0xC4, 0xCA, 0xD4), (x + y) / (2 * S - 2)) + (255,)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(3.5 * 16), fill=255)
    out.paste(bg, (0, 0), m)
    m2 = Image.new('L', (S, S), 0); ImageDraw.Draw(m2).rounded_rectangle([16, 16, 15 * 16 - 1, 15 * 16 - 1], radius=int(2.5 * 16), fill=255)
    out.paste(lid, (0, 0), m2)
    im = out.resize((16, 16), Image.LANCZOS)
    p = im.load()
    ink = (0x1D, 0x2C, 0x86)
    for y, r in enumerate(G16):
        for x, ch in enumerate(r):
            if ch == '#': p[x, y] = ink + (255,)
            elif ch == 'o': p[x, y] = lerp(p[x, y][:3], ink, .55) + (255,)
    return im

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
        b.close()
    for name, s in [('pwa-512.png', 512), ('pwa-192.png', 192), ('apple-touch-icon.png', 180)]:
        save_png(down(full, s).convert('RGB'), PUB / name)
    save_png(down(mask, 512).convert('RGB'), PUB / 'pwa-maskable-512.png')
    save_png(down(fav, 32), PUB / 'favicon-32.png')
    h16 = hinted16()
    save_png(h16, PUB / 'favicon-16.png')
    # Pillow ICO: 첫 그림보다 큰 크기는 버리므로 48을 앞에 둠
    fr = {s: down(fav, s) for s in (24, 32, 48)}
    fr[48].save(PUB / 'favicon.ico', format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48)], append_images=[h16, fr[24], fr[32]])
    print('done', 'oxipng' if oxipng else '(oxipng 없음: Pillow optimize만)')

if __name__ == '__main__':
    main()
