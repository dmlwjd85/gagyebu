"""누르거나 입력하는 요소의 테두리·경계 대비 전수 검사(WCAG 1.4.11, 3:1) — QA 4차 정식 R2 재발 방지.
사용: python3 tools/qa/ctl_boundary.py [URL] [결과 JSON 경로]
 - 에뮬레이터 빌드 미리보기 주소. 360px × 밝음·어두움으로 로그인 화면, 모든 탭·화면(달력 목록, 검색 결과, 가져오기 단계 포함),
   입력 시트(새 기록·고치기·더보기 펼침), 대화상자(예산·목표·규칙·용돈·반복·로그아웃 확인), 리포트 창을 열어 검사
 - 대상: input·select·textarea·button·a[href]·[role=button|switch|tab|radio]·.switch·[tabindex]
 - 경계 대비 = max(면 vs 바깥, 테두리 vs 바깥, 고리·받침 그림자 vs 바깥). 반투명 면은 바탕에 겹쳐 계산
   · 채워진 버튼처럼 면이 대비를 주면 면 대비로 판단
   · .seg 안의 칸은 묶음(.seg) 바깥 경계와, 고른 칸의 고리(면 대비)로 판단
   · 면·테두리가 없는 글자·아이콘 단추(링크형·아이콘)는 '글자만'으로 따로 적음(입력칸은 글자만이어도 실패)
   · 비활성(disabled)은 제외(WCAG 예외)
   · 그라디언트 위에 있는 요소는 화면 픽셀로 측정
 - 3:1 미만이 하나라도 있으면 종료 코드 1
"""
import sys, os, json, io
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu
URL = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
OUT = sys.argv[2] if len(sys.argv) > 2 else None
SAMPLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../samples/현대카드_실제형식_예시.xlsx')
emu.reset()
SCAN = r"""(rootSel) => {
  const parse = (c) => {
    if (!c || c === 'transparent') return [0, 0, 0, 0];
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const v = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [v[0] * 255, v[1] * 255, v[2] * 255, v.length > 3 ? v[3] : 1]; }
    return null;
  };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // el 아래(el 자신 제외) 바탕색. 그라디언트를 만나면 grad=true
  const under = (el) => {
    const layers = []; let grad = false, unknown = false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none' && /gradient/.test(s.backgroundImage)) grad = true;
      const p = parse(s.backgroundColor); if (!p) { unknown = true; continue; }
      if (p[3] > 0) { layers.push(p); if (p[3] >= 1) break; }
    }
    let c = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop().slice(0, 3).concat(1) : (document.documentElement.classList.contains('dark') ? [20, 18, 34, 1] : [255, 255, 255, 1]);
    for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c);
    return { c, grad, unknown };
  };
  const shadows = (s) => {
    if (!s || s === 'none') return [];
    // "rgb(..) 0px 2px 0px 0px" 또는 "rgb(..) 0px 0px 0px 1.5px inset"
    return s.split(/,(?![^(]*\))/).map((x) => x.trim()).map((x) => {
      const col = (x.match(/(rgba?\([^)]+\)|color\([^)]+\))/) || [])[1];
      const nums = x.replace(col || '', '').match(/-?[\d.]+px/g)?.map(parseFloat) || [];
      const [ox = 0, oy = 0, blur = 0, spread = 0] = nums;
      return { col: parse(col), ring: blur === 0 && (spread >= 1 || Math.abs(oy) >= 1 || Math.abs(ox) >= 1), inset: /inset/.test(x) };
    }).filter((x) => x.col && x.ring && x.col[3] > 0);
  };
  const desc = (el) => { const t = (el.getAttribute('aria-label') || el.placeholder || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24); const cl = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : ''; return `${el.tagName.toLowerCase()}${cl ? '.' + cl : ''} "${t}"`; };
  const measure = (t) => {
    const s = getComputedStyle(t), out = under(t.parentElement);
    const own = parse(s.backgroundColor) || [0, 0, 0, 0];
    const face = over(own, out.c);
    const r = { face: +cr(face, out.c).toFixed(2), border: 0, shadow: 0, grad: out.grad };
    const ownGrad = /gradient/.test(s.backgroundImage || '');
    if (ownGrad) r.grad = true;
    r.boxed = ownGrad || own[3] > 0.02 && (r.face > 1.02 || out.grad);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(s[`border${side}Width`]) >= 1 && !/none|hidden/.test(s[`border${side}Style`])) {
        const bc = parse(s[`border${side}Color`]); if (bc && bc[3] > 0) { r.boxed = true; r.border = Math.max(r.border, +cr(over(bc, out.c), out.c).toFixed(2)); }
      }
    }
    for (const sh of shadows(s.boxShadow)) { r.boxed = true; r.shadow = Math.max(r.shadow, +cr(over(sh.col, sh.inset ? face : out.c), sh.inset ? out.c : out.c).toFixed(2)); }
    r.best = Math.max(r.face, r.border, r.shadow);
    return r;
  };
  const root = document.querySelector(rootSel) || document.body;
  const seen = new Set(), rows = []; window.__ctlEls = [];
  for (const el of root.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],[role=button],[role=switch],[role=tab],[role=radio],.switch,[tabindex]:not([tabindex="-1"])')) {
    const rc = el.getBoundingClientRect();
    if (rc.width < 4 || rc.height < 4) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || +s.opacity === 0 || el.closest('[inert]') && !root.closest?.('[inert]')) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    let t = el, kind = 'ctl';
    if (el.matches('.switch input')) continue; // 스위치는 .switch 칸(span)으로 측정
    if (el.matches('.switch')) { t = el.querySelector('span') || el; kind = 'switch'; }
    if (el.matches('.fab') && el.querySelector('.fab-disc')) { t = el.querySelector('.fab-disc'); kind = 'fab'; } // 기록 단추는 접시(.fab-disc)가 면
    if (seen.has(t)) continue; seen.add(t);
    const r = measure(t);
    const dis = el.disabled || el.getAttribute('aria-disabled') === 'true';
    const seg = el.parentElement?.closest('.seg');
    const isField = el.matches('input,select,textarea');
    const native = el.matches('input[type=checkbox],input[type=radio],input[type=range],input[type=file],input[type=color]');
    let status;
    // 면·테두리 없는 입력칸은 감싼 칸(label·div, 3단계까지)의 경계로 측정
    if (isField && !r.boxed) {
      for (let w = el.parentElement, i = 0; w && i < 3; w = w.parentElement, i++) {
        if (w.querySelectorAll('input,select,textarea').length > 1) break;
        const m = measure(w); if (m.boxed) { Object.assign(r, m); r.wrap = desc(w); break; }
      }
    }
    if (dis) status = 'disabled';
    else if (el.matches('.cal-cell')) status = 'data'; // 달력 날짜 칸: 칸 색은 쓴 돈 정도(열지도)이고, 칸은 7열 격자·날짜 숫자로 알아봄
    else if (native) status = 'native';
    else if (seg) { const g = measure(seg); r.group = g.best; status = g.best >= 3 ? 'ok-group' : 'fail'; r.selRing = r.best; }
    else if (!r.boxed) status = isField ? 'fail' : 'text';
    else if (r.grad) status = 'grad';
    else status = r.best >= 3 ? 'ok' : 'fail';
    window.__ctlEls.push(t);
    rows.push({ i: window.__ctlEls.length - 1, el: desc(el) + (r.wrap ? ' ⊂ ' + r.wrap : ''), kind, status, ...r, rect: [rc.x, rc.y, rc.width, rc.height].map(Math.round) });
  }
  return rows;
}"""
def pixel_check(pg, row):
    """그라디언트 위 요소: 왼쪽 가운데 가장자리 픽셀로 바깥·테두리·면을 직접 측정"""
    from PIL import Image
    x, y, w, h = row['rect']
    if w < 8 or h < 8: return None
    pad = 4
    png = pg.screenshot(clip={'x': max(0, x - pad), 'y': max(0, y), 'width': min(w + 2 * pad, 360 - max(0, x - pad)), 'height': h})
    im = Image.open(io.BytesIO(png)).convert('RGB'); my = h // 2; ox = x - max(0, x - pad)
    def lum(c):
        f = lambda v: v / 12.92 if (v := v / 255) <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    cr = lambda a, b: (max(lum(a), lum(b)) + 0.05) / (min(lum(a), lum(b)) + 0.05)
    outside = im.getpixel((max(0, ox - 3), my)); edge = im.getpixel((ox, my)); face = im.getpixel((min(im.width - 1, ox + 3), my))
    return round(max(cr(edge, outside), cr(face, outside)), 2)

def native_check(pg, row):
    from PIL import Image
    x, y, w, h = row['rect']
    if x < 4: return None
    png = pg.screenshot(clip={'x': x - 4, 'y': y, 'width': min(w + 4, 360 - x + 4), 'height': h})
    im = Image.open(io.BytesIO(png)).convert('RGB')
    def lum(c):
        f = lambda v: v / 12.92 if (v := v / 255) <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    lo = lum(im.getpixel((1, h // 2)))
    return round(max((max(lum(c), lo) + 0.05) / (min(lum(c), lo) + 0.05) for c in set(im.getdata())), 2)

results, fails = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    ctx = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul', service_workers='block')
    pg = ctx.new_page()
    last = {'screen': ''}
    pg.on('load', lambda *_: print('다시 읽힘(load) 직전 화면:', last['screen']))
    def scan(theme, screen, root='body'):
        pg.mouse.move(1, 1); pg.wait_for_timeout(350); last['screen'] = f'{theme}/{screen}'
        rows = pg.evaluate(SCAN, root)
        for r in rows:
            if r['status'] in ('native', 'grad'):  # 픽셀로 잴 것은 화면 가운데로 옮긴 뒤 위치를 다시 읽음
                r['rect'] = pg.evaluate("(i) => { const e = window.__ctlEls[i]; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const rc = e.getBoundingClientRect(); return [rc.x, rc.y, rc.width, rc.height].map(Math.round); }", r['i']); pg.wait_for_timeout(150)
            if r['status'] == 'native':  # 브라우저가 그리는 슬라이더 등: 칸 안 픽셀 중 바깥과 가장 다른 곳(손잡이·채운 막대)
                r['pixel'] = native_check(pg, r); r['status'] = 'ok' if r['pixel'] and r['pixel'] >= 3 else 'fail'
            if r['status'] == 'grad':
                px = pixel_check(pg, r); r['pixel'] = px; r['status'] = 'ok' if px and px >= 3 else 'fail'
            r.update(theme=theme, screen=screen); results.append(r)
            if r['status'] == 'fail': fails.append(r)
    def theme_set(t):
        pg.evaluate(f"localStorage.setItem('theme','{t}'); document.documentElement.classList.toggle('dark', {str(t == 'dark').lower()})")
    pg.goto(URL); pg.wait_for_selector('[data-action="login-test"]', state='attached', timeout=20000); pg.wait_for_timeout(1200)
    for t in ('light', 'dark'): theme_set(t); scan(t, 'login')
    pg.click('text=테스트 계정으로 로그인'); pg.wait_for_selector('#main', state='attached', timeout=20000); pg.wait_for_timeout(1500)
    pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(2500)
    for t in ('light', 'dark'): theme_set(t); pg.evaluate("window.__gagyebu.go('home')"); pg.wait_for_timeout(500); scan(t, 'onboarding')
    pg.locator('[data-mode-later]').first.click(); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.evaluate("""(() => { const d = window.__gagyebu.data; d.saveGoal({ name: '여행', emoji: '✈️', target: 1000000, saved: 300000, order: 0 });
      d.saveRecurring({ name: '통신비', amount: 50000, kind: 'expense', categoryId: 'telecom', dayOfMonth: 25, active: true, startYm: '2026-10' }); })()""")
    pg.wait_for_timeout(1200)
    def G(v):
        try: pg.evaluate(f"window.__gagyebu.go('{v}')")
        except Exception as e:
            print('이동 실패:', v, last['screen'], pg.url, str(e)[:80]); pg.wait_for_load_state('load'); pg.wait_for_timeout(3000)
            pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user', timeout=20000); pg.wait_for_timeout(1500)
            pg.evaluate(f"window.__gagyebu.go('{v}')")
        pg.wait_for_timeout(600)
    def dialog(theme, name, action, view):
        G(view)
        btn = pg.locator(f'[data-action="{action}"]').first
        if not btn.count(): print(f'건너뜀: {name}(버튼 없음)'); return
        btn.scroll_into_view_if_needed(); btn.click(); pg.wait_for_timeout(700)
        scan(theme, name, '.dlg-wrap:last-of-type, [role=dialog]:not(.sheet)')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        if pg.locator('.dlg-wrap').count(): print(f'경고: {name} 창이 Esc로 안 닫힘')
    for t in ('light', 'dark'):
        theme_set(t)
        for v in ['home', 'calendar', 'chart', 'budget', 'settings', 'search', 'recurring', 'assets', 'tax', 'import']:
            G(v)
            if v == 'search': pg.fill('[data-search-q]', '카페'); pg.wait_for_timeout(700)
            scan(t, v)
            if v == 'calendar':
                pg.evaluate("window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); scan(t, 'calendar-list')
                pg.evaluate("window.__gagyebu.ui.mode='cal'; window.__gagyebu.render()")
        pg.set_input_files('[data-imp-file]', SAMPLE); pg.wait_for_timeout(1500); scan(t, 'import2')
        pg.click('[data-imp-next]'); pg.wait_for_timeout(1200); scan(t, 'import3')
        G('home'); pg.evaluate('window.__gagyebu.openSheet()'); pg.wait_for_timeout(600); scan(t, 'sheet-new', '.sheet')
        more = pg.locator('.sheet .opt-summary').first
        if more.count(): more.click(); pg.wait_for_timeout(400); scan(t, 'sheet-more', '.sheet')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.evaluate('window.__gagyebu.openSheet(window.__gagyebu.state.txs[0])'); pg.wait_for_timeout(600); scan(t, 'sheet-edit', '.sheet')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        for name, action, view in [('dlg-budget', 'budget', 'budget'), ('dlg-goal', 'add-goal', 'budget'), ('dlg-rule', 'add-rule', 'settings'),
('dlg-recurring', 'add-rec', 'recurring'), ('dlg-logout', 'logout', 'settings'),
                                   ('report', 'report', 'chart')]:
            dialog(t, name, action, view)
    # 쓰는 방식(1인·부부·학생)마다 홈·예산·설정 카드가 달라 따로 훑음(홈 주식·연금 단추, 용돈 창 포함)
    # 앞 단계(가져오기·리포트 등) 상태가 남지 않게 새 탭에서(로그인은 같은 브라우저 문맥이라 유지)
    pg.close(); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user', timeout=30000); pg.wait_for_timeout(2500)
    for md in ('single', 'couple', 'student'):
        G('settings'); pg.locator(f'[data-set-mode="{md}"]').first.click(); pg.wait_for_timeout(900)
        print('방식', md, '→', pg.evaluate('window.__gagyebu.state.settings.mode'))
        for t in ('light', 'dark'):
            theme_set(t)
            for v in ('home', 'budget', 'settings'): G(v); scan(t, f'{v}-{md}')
            if md == 'student': dialog(t, 'dlg-allowance', 'allowance', 'home')
    b.close()
from collections import Counter
for t in ('light', 'dark'):
    c = Counter(r['status'] for r in results if r['theme'] == t)
    print(f'{t}: 검사 {sum(c.values())}개 —', ', '.join(f'{k} {v}' for k, v in sorted(c.items())))
    mins = [max(r['best'], r.get('pixel', 0)) if r['status'] == 'ok' else r.get('group', 0) for r in results if r['theme'] == t and r['status'] in ('ok', 'ok-group')]
    if mins: print(f'  통과 중 가장 낮은 경계 대비 {min(mins)}')
seen = set()
for r in fails:
    k = (r['theme'], r['el'])
    if k in seen: continue
    seen.add(k); print(f"NG {r['theme']:5} {r['screen']:12} {r['el']}  면 {r['face']} 테두리 {r['border']} 그림자 {r['shadow']}{' 픽셀 ' + str(r.get('pixel')) if r.get('pixel') is not None else ''}{' 묶음 ' + str(r.get('group')) if 'group' in r else ''}")
texts = sorted({(r['theme'], r['el']) for r in results if r['status'] == 'text'})
print('달력 날짜 칸(열지도, 제외):', len([r for r in results if r['status'] == 'data']), '개')
print(f'글자·아이콘만(면·테두리 없음, 3:1 경계 대상 아님) {len(texts)}종:', '; '.join(sorted({e for _, e in texts}))[:1500])
if OUT: json.dump(results, open(OUT, 'w'), ensure_ascii=False, indent=0)
print('결과:', '모두 3:1 이상' if not fails else f'{len(seen)}종 3:1 미만')
sys.exit(1 if fails else 0)
