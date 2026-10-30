#!/usr/bin/env python3
"""쨈 폰트 웹 조각 만들기 (쨈 폰트 v1.0.5 원본 묶음에서).

하는 일
1. 앱 소스(src/**, index.html)의 화면 글자를 모아 '첫 조각'(.core.woff2)을 굵기마다 하나씩 만든다.
   - 들어가는 글자: 영문·숫자·기호(U+0020-007E, U+00A0-00FF, 문장부호·화살표·₩ 등) + 소스에 나오는 한글·기호.
   - 주석은 빼고 센다. 소스에 없는 글자는 원본 .ks / .ext 조각에서 필요할 때만 받는다.
2. 가운뎃점(U+00B7)은 첫 조각 안에서만 폭을 좁힌다(원래 0.561em → 약 0.3em). 모양은 그대로 가운데로 옮긴다.
3. 쨈 제목 평면은 리포트 그림 제목 '쨈 가계부'에 쓰는 글자만 남긴다(.title.woff2).
4. jjaem-font.css 를 다시 쓴다. 원본 .ks/.ext 의 unicode-range 에서 첫 조각 글자를 빼서 서로 겹치지 않게 한다.
   굵기는 두 벌뿐이라 100~500 은 보통(400), 600~900 은 굵게(700) 파일로 일부러 묶는다(가짜 굵게 없음).

사용: python3 tools/font/make-jjaem-core.py [쨈폰트_v1.0.5 폴더]
"""
import glob, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

PKG = sys.argv[1] if len(sys.argv) > 1 else '/workspace/font/release/쨈폰트_v1.0.5'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src/assets/fonts/jjaem')
TITLE_TEXT = '쨈 가계부'
DOT = 0xB7
DOT_SIDE = 84  # 가운뎃점 양옆 여백(1000 기준)


def strip_comments(text, ext):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    if ext != 'css':
        text = re.sub(r'(^|\s)//[^\n]*', '', text)
    return text


def source_chars():
    files = [f for f in glob.glob(os.path.join(ROOT, 'src/**/*.*'), recursive=True)
             if f.endswith(('.js', '.css', '.html')) and not f.endswith('.test.js')]
    files.append(os.path.join(ROOT, 'index.html'))
    chars = set()
    for f in files:
        with open(f, encoding='utf-8') as fh:
            chars |= {ord(c) for c in strip_comments(fh.read(), f.rsplit('.', 1)[1])}
    return chars


BASE_RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x203A), (0x20A9, 0x20A9),
               (0x2190, 0x2194), (0x2212, 0x2212), (0x3131, 0x318E)]


def parse_range(s):
    out = set()
    for tok in s.replace(' ', '').split(','):
        tok = tok.upper().removeprefix('U+')
        if '-' in tok:
            a, b = tok.split('-'); out |= set(range(int(a, 16), int(b, 16) + 1))
        elif '?' in tok:
            out |= set(range(int(tok.replace('?', '0'), 16), int(tok.replace('?', 'F'), 16) + 1))
        else:
            out.add(int(tok, 16))
    return out


def fmt_range(cps):
    cps = sorted(cps); parts = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        parts.append(f'U+{cps[i]:04X}' if i == j else f'U+{cps[i]:04X}-{cps[j]:04X}')
        i = j + 1
    return ','.join(parts)


def make_subset(src, dst, cps):
    font = TTFont(src)
    opts = subset.Options(); opts.flavor = 'woff2'; opts.name_IDs = ['*']
    opts.name_languages = ['*']; opts.notdef_outline = True; opts.recalc_bounds = True
    sub = subset.Subsetter(opts); sub.populate(unicodes=cps); sub.subset(font)
    return font, opts


def narrow_dot(font):
    cmap = font.getBestCmap()
    name = cmap.get(DOT)
    if not name: return None
    glyf = font['glyf']; g = glyf[name]
    users = [n for n in font.getGlyphOrder() if glyf[n].isComposite() and any(c.glyphName == name for c in glyf[n].components)]
    if users:  # 다른 글자가 부품으로 쓰면 옮기지 않음
        raise SystemExit(f'가운뎃점을 부품으로 쓰는 글자가 있어요: {users}')
    g.recalcBounds(glyf)
    width = g.xMax - g.xMin
    dx = DOT_SIDE - g.xMin
    if g.numberOfContours > 0:
        coords = g.coordinates; coords.translate((dx, 0)); g.recalcBounds(glyf)
    adv = width + 2 * DOT_SIDE
    font['hmtx'][name] = (adv, g.xMin)
    return adv
HEAD = """/* 쨈 폰트 v1.0.5 웹 글꼴(쨈 폰트 팀, JJAEM Font Team). 이 파일은 tools/font/make-jjaem-core.py 가 만들어요. 손으로 고치지 마세요.
   원본: 쨈폰트_v1.0.5/웹용/jjaem-font.css (.ks/.ext 파일은 원본 그대로), 설치용 TTF 에서 첫 조각·제목 조각을 잘라 냄.
   - 쨈 본문(JJAEM Body): 화면 글자 전부. 숫자는 폭이 같아 금액 자리가 맞아요. SIL OFL 1.1, OFL-JJAEMBody.txt
     · .core = 앱 화면에 나오는 글자(소스에서 모음) + 영문·숫자·기호. 먼저 받는 작은 조각이에요. 가운뎃점(·)은 여기서 폭을 좁혔어요.
     · .ks = 자주 쓰는 한글 2,350자 중 나머지 / .ext = 나머지 한글. 사용자가 쓴 글자에 있을 때만 받아요.
     · 굵기는 두 벌뿐이에요. 100~500 은 보통(400), 600~900 은 굵게(700) 파일로 일부러 묶어 가짜 굵게가 생기지 않게 해요.
   - 쨈 제목 평면(JJAEM Title Flat): 월간 리포트 그림의 '쨈 가계부' 44px 제목 글자만. 쨈제목_사용조건.md
   - 입체·컬러 제목은 48px 이상에만 써야 하는데 앱 화면에 그만한 글자 제목이 없어 싣지 않았어요.
   - font-display: swap → 시스템 글꼴로 먼저 그리고, 글꼴이 오면 바꿔 그림.
   - 이 파일은 설정 글꼴이 기본(쨈 본문)일 때만 불러 와요(look.js). 본문 woff2 는 설치 캐시(precache)에 넣지 않고 처음 볼 때 저장해요. */
"""


def main():
    css_src = open(os.path.join(PKG, '웹용/jjaem-font.css'), encoding='utf-8').read()
    blocks = re.findall(r'@font-face\{[^}]*\}', css_src)
    def find(family, file_part):
        for b in blocks:
            if f"font-family:'{family}'" in b and file_part in b: return b
        raise SystemExit(f'원본 CSS에 없음: {family} {file_part}')

    src_chars = source_chars()
    base = set().union(*(set(range(a, b + 1)) for a, b in BASE_RANGES))
    os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
    out_blocks = []
    report = []
    for style, weight, wrange in [('Regular', 400, '100 500'), ('Bold', 700, '600 900')]:
        ttf = os.path.join(PKG, f'설치용/쨈본문/JJAEMBody-{style}.ttf')
        have = set(TTFont(ttf, lazy=True).getBestCmap())
        core = (base | src_chars) & have
        font, opts = make_subset(ttf, None, core)
        adv = narrow_dot(font)
        dst = os.path.join(OUT, f'fonts/JJAEMBody-{style}.core.woff2')
        font.flavor = 'woff2'; font.save(dst)
        hangul = sum(1 for c in core if 0xAC00 <= c <= 0xD7A3)
        report.append(f'JJAEMBody-{style}.core.woff2 {os.path.getsize(dst):,}B 글자 {len(core)}(한글 {hangul}) 가운뎃점 폭 {adv}')
        rest = []
        for part in ('ks', 'ext'):
            b = find('JJAEM Body', f'JJAEMBody-{style}.{part}.woff2')
            rng = parse_range(re.search(r'unicode-range:([^;}]*)', b).group(1)) - core
            rest.append((part, rng))
        def face(file, rng):
            return (f"@font-face{{font-family:'JJAEM Body';font-style:normal;font-weight:{wrange};font-display:swap;"
                    f"src:url('fonts/{file}') format('woff2');unicode-range:{fmt_range(rng)}}}")
        out_blocks.append(face(f'JJAEMBody-{style}.core.woff2', core))
        for part, rng in rest:
            out_blocks.append(face(f'JJAEMBody-{style}.{part}.woff2', rng))
    # 제목 평면: 리포트 제목 글자만
    tcps = {ord(c) for c in TITLE_TEXT}
    tsrc = os.path.join(PKG, '설치용/쨈제목평면/전체판/JJAEM-TitleFlat-Regular.ttf')
    tfont, _ = make_subset(tsrc, None, tcps)
    tdst = os.path.join(OUT, 'fonts/JJAEM-TitleFlat-Regular.title.woff2'); tfont.flavor = 'woff2'; tfont.save(tdst)
    report.append(f'JJAEM-TitleFlat-Regular.title.woff2 {os.path.getsize(tdst):,}B 글자 {len(tcps)}')
    out_blocks.append("@font-face{font-family:'JJAEM Title Flat';font-style:normal;font-weight:400;font-display:swap;"
                      f"src:url('fonts/JJAEM-TitleFlat-Regular.title.woff2') format('woff2');unicode-range:{fmt_range(tcps)}}}")
    with open(os.path.join(OUT, 'jjaem-font.css'), 'w', encoding='utf-8') as fh:
        fh.write(HEAD + '\n'.join(out_blocks) + '\n')
    print('\n'.join(report))


if __name__ == '__main__':
    main()
