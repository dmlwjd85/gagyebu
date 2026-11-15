"""줌·글자 배율 자동 점검(PR #9 QA 재발 방지).
사용: python3 tools/qa/zoom_check.py [URL] [matrix|scale|tip] [demo|huge]
 - matrix: 화면 9종(320×568 ~ 1920×1080) × 브라우저 줌 25~400% (QA의 108조합 + 300·400%)
 - scale : 폭 160~1920px × 본문 글자 85~160%
 - tip   : 팁이 메뉴·기록·토스트를 가리지 않는지
 - huge  : 아주 큰 금액(9억대 수입·1억대 지출)을 더해서 검사
 화면마다 아래 메뉴 5개(화면 안·눌림), 금액·날짜 줄갈림/말줄임/잘림, 팁 가림, 가로 넘침, 낮은 화면 메뉴 비율(맨 위·실제 휠로 160px 내린 뒤·60px 올린 뒤)을 잰다.
 scale 에서는 큰 숫자(data-fit)의 글자 크기를 (폭·화면·순번)별로 배율 순서대로 비교해, 배율을 올렸는데 작아지거나 도넛 금액이 라벨보다 작으면 실패.
 QA 108조합(줌 ≤200%)·scale 에서 하나라도 문제가 있으면 종료 코드 1. 에뮬레이터는 이 실행 전용 프로젝트만 씀(emu.py).
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu  # 에뮬레이터 주소·프로젝트(emu.py 참고)
from playwright.sync_api import sync_playwright
URL = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
MODE = sys.argv[2] if len(sys.argv) > 2 else 'matrix'; DATA = sys.argv[3] if len(sys.argv) > 3 else 'demo'
emu.reset(); os.environ['SEED'] = '1'
ONLINE = os.environ.get('ONLINE', '1') == '1'
WIDTHS = {320:568,360:640,390:844,414:896,768:1024,1024:768,1280:800,1440:900,1920:1080}
ZOOMS = [25,33,50,67,80,90,100,110,125,150,175,200,300,400]
VIEWS = ['home', 'calendar', 'chart', 'budget', 'search', 'recurring', 'settings']
MENU_JS = r"""window.__menu = () => { // [보이는 메뉴 비율, 고정 메뉴 비율] — 고정: 스크롤해도 화면에 붙어 있는 것(본문만 스크롤되는 기본 화면의 위·아래 메뉴, 낮은 화면의 sticky 아래 메뉴)
  const H = window.innerHeight, main = document.querySelector('#main'), boxed = main && getComputedStyle(main).overflowY !== 'visible';
  const els = [document.querySelector('.app-top'), document.querySelector('.tabbar')].filter((e) => e && getComputedStyle(e).display !== 'none');
  const h = (e) => { const r = e.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)); };
  const pinned = (e) => boxed || /sticky|fixed/.test(getComputedStyle(e).position);
  const pct = (v) => Math.round(v / H * 1000) / 10;
  return [pct(els.reduce((a, e) => a + h(e), 0)), pct(els.filter(pinned).reduce((a, e) => a + h(e), 0))]; }"""
CHECK = r"""(opts) => { const MENU = window.__menu;
  const W = document.documentElement.clientWidth, H = window.innerHeight, out = {tabs: null, amt: [], tip: null, menu: null};
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  // 1) 아래 메뉴 5개: 화면 안 + 가운데를 누르면 그 버튼
  const tb = document.querySelector('.tabbar');
  if (tb && getComputedStyle(tb).display !== 'none') {
    const items = [...tb.querySelectorAll('.tab, .fab')];
    out.tabs = items.map((e) => { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const inside = r.left >= -0.5 && r.right <= W + 0.5 && r.top >= -0.5 && r.bottom <= H + 0.5;
      const hit = inside && e.contains(document.elementFromPoint(cx, cy));
      return { n: e.dataset.nav || 'add', ok: inside && hit, w: Math.round(r.width), h: Math.round(r.height) }; });
  }
  // 2) 금액·날짜 토큰: 여러 줄로 갈림 / 말줄임 / 잘림
  const RE = /[−+\-]?\d{1,3}(?:,\d{3})+(?:원)?|[−+\-]?\d+(?:\.\d+)?(?:원|만|억|%)|\d{1,2}\.\d{1,2}(?=\s|$|\b)/g;
  const root = document.querySelector('#main');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; const seen = new Set();
  while ((n = walker.nextNode())) {
    const el = n.parentElement; if (!el || !vis(el) || el.closest('.sr-only,[aria-hidden=true] svg,svg,.skeleton')) continue;
    const txt = n.textContent; RE.lastIndex = 0; let m;
    while ((m = RE.exec(txt))) {
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const rects = [...rg.getClientRects()].filter((r) => r.width > 0.5);
      if (!rects.length) continue;
      const tops = new Set(rects.map((r) => Math.round(r.top / 3)));
      const bb = rg.getBoundingClientRect();
      const probs = [];
      if (tops.size > 1) probs.push('줄갈림');
      // 말줄임: 이 텍스트를 가진 상자(또는 조상)가 text-overflow:ellipsis 이면서 넘침
      for (let p = el; p && p !== root; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.textOverflow === 'ellipsis' && p.scrollWidth > p.clientWidth + 0.5) { probs.push('말줄임'); break; } }
      // 잘림: overflow 가 visible 이 아닌 조상(본문 포함)·화면 밖
      for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const pr = p.getBoundingClientRect();
          if (bb.left < pr.left - 1 || bb.right > pr.right + 1) { probs.push('잘림(' + (p.id || p.className.toString().slice(0, 20)) + ' ' + Math.round(bb.left) + '~' + Math.round(bb.right) + ' vs ' + Math.round(pr.left) + '~' + Math.round(pr.right) + ')'); break; } } }
      if (bb.left < -1 || bb.right > W + 1) probs.push('화면밖');
      if (probs.length) { const k = m[0] + probs.join(); if (!seen.has(k)) { seen.add(k); out.amt.push(m[0] + ' ' + probs.join('/') + ' @' + (el.className.toString().slice(0, 24))); } }
    }
  }
  out.amtN = out.amt.length; out.amt = out.amt.slice(0, 5);
  // 3) 팁: 떠 있지 않음 + 위·아래 메뉴·토스트·기록과 겹치지 않음
  const tip = document.querySelector('.tip');
  if (tip && vis(tip)) {
    const t0 = tip.getBoundingClientRect(), pos = getComputedStyle(tip).position;
    // 본문 스크롤 상자 밖으로 나간 부분은 '잘려 안 보이는 것'이지 가리는 게 아님 → 보이는 부분만
    const mr = getComputedStyle(root).overflowY !== 'visible' ? root.getBoundingClientRect() : {top: 0, bottom: (tb && getComputedStyle(tb).position === 'sticky') ? tb.getBoundingClientRect().top : H, left: 0, right: W}; // 낮은 화면: 아래 메뉴(스티키) 뒤로 지나가는 건 가림이 아님
    const tr = {left: t0.left, right: t0.right, top: Math.max(t0.top, mr.top), bottom: Math.min(t0.bottom, mr.bottom)};
    tr.width = tr.right - tr.left; tr.height = Math.max(0, tr.bottom - tr.top);
    const ov = (s) => { const e = document.querySelector(s); if (!e || !vis(e) || !tr.height) return 0; const r = e.getBoundingClientRect(); return Math.max(0, Math.min(tr.right, r.right) - Math.max(tr.left, r.left)) * Math.max(0, Math.min(tr.bottom, r.bottom) - Math.max(tr.top, r.top)); };
    const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
    const top = (tr.height > 4 && cy > 0 && cy < H) ? document.elementFromPoint(cx, cy) : null;
    out.tip = { pos, overHeader: ov('.app-top'), overTab: ov('.tabbar'), overRecent: ov('[aria-labelledby=recent-h]'), covered: top ? !tip.contains(top) : null };
  }
  // 4) 메뉴 비율(맨 위): 화면 안에 보이는 위 메뉴+아래 메뉴 높이 / 화면 높이
  [out.menu, out.pin] = MENU();
  // 5) 큰 숫자(data-fit) 글자 크기: 같은 화면·같은 순번끼리 배율별로 비교(배율↑인데 작아지면 실패), 도넛 금액 < 라벨이면 실패
  out.fits = [...root.querySelectorAll('[data-fit]')].filter(vis).map((e, i) => { const fs = parseFloat(getComputedStyle(e).fontSize);
    const lab = e.dataset.fitLabel === 'prev' && e.previousElementSibling ? parseFloat(getComputedStyle(e.previousElementSibling).fontSize) : null;
    return [i, Math.round(fs * 10) / 10, lab, (e.textContent || '').trim().slice(0, 14), e.className.toString().split(' ').find((c) => /^text-|^stat|^num|^amount/.test(c)) || '']; });
  out.docOver = document.documentElement.scrollWidth - W;
  out.hdrLines = (() => { const h = document.querySelector('.app-top header'); if (!h) return null; const tops = new Set([...h.querySelectorAll('button,.offline-badge,svg')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 22); })); return tops.size; })();
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', reduced_motion='reduce')
    c.add_init_script(MENU_JS)
    if ONLINE: c.add_init_script("Object.defineProperty(Navigator.prototype,'onLine',{get:()=>true})")
    pg = c.new_page()
    pg.goto(URL); pg.wait_for_selector('text=테스트 계정으로 로그인', timeout=30000)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:null,dismiss:{},excluded:[]}))")
    pg.click('text=테스트 계정으로 로그인'); pg.wait_for_selector('#main', timeout=30000); pg.wait_for_timeout(800)
    if os.environ.get('SEED') == '1':
        pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(2500)
        pg.evaluate("""(()=>{const g=window.__gagyebu, d=g.data, c=g.state.categories.find(c=>c.kind==='expense');
          d.saveGoal({name:'제주 여행', emoji:'✈️', target:1200000, saved:400000, due:'2027-04-30'}); d.saveGoal({name:'비상금', target:3000000, saved:3000000});
          d.saveRecurring({name:'월세', amount:550000, kind:'expense', categoryId:c.id, dayOfMonth:25, active:true, startYm:'2026-10', lastPosted:'2026-10'});})()""")
        pg.wait_for_timeout(1200)
    if DATA == 'huge' and os.environ.get('SEED') == '1':
        pg.evaluate("""(()=>{const g=window.__gagyebu, d=g.data, st=g.state; const ex=st.categories.find(c=>c.kind==='expense'), inc=st.categories.find(c=>c.kind==='income'); const a=st.accounts[0];
          d.saveTx({date:'2026-10-03', amount:987654321, kind:'income', categoryId:inc.id, accountId:a.id, memo:'아주 큰 수입'});
          d.saveTx({date:'2026-10-04', amount:123456789, kind:'expense', categoryId:ex.id, accountId:a.id, memo:'아주 큰 지출'});})()""")
        pg.wait_for_timeout(1500)
    res = []
    def run(W, H, scale, tag, views=VIEWS, tips=False):
        pg.set_viewport_size({'width': max(1, round(W)), 'height': max(1, round(H))})
        pg.evaluate(f"(()=>{{const v={scale}; if(v===1) localStorage.removeItem('contentScale'); else localStorage.setItem('contentScale', String(v)); document.documentElement.style.setProperty('--content-scale', String(v));}})()")
        for v in views:
            if tips:
                pg.evaluate("localStorage.removeItem('tips')")
                pg.evaluate("window.__gagyebu.go('settings')"); pg.wait_for_timeout(100)
            pg.evaluate(f"window.__gagyebu.go('{v}')"); pg.wait_for_timeout(350)
            r = pg.evaluate(CHECK, {}); r.update(tag=tag, view=v, W=round(W), H=round(H), scale=scale)
            if H <= 500 and MODE != 'tip':
                # 실제 휠로 160px 내린 뒤 / 다시 60px 올린 뒤의 메뉴 비율
                pg.mouse.move(max(1, W / 2), max(1, H / 2)); pg.mouse.wheel(0, 160); pg.wait_for_timeout(300)
                r['menuDown'], r['pinDown'] = pg.evaluate('window.__menu()'); r['scrolled'] = pg.evaluate('Math.round(document.scrollingElement.scrollTop || document.querySelector("#main").scrollTop)')
                pg.mouse.wheel(0, -60); pg.wait_for_timeout(300)
                r['menuUp'], r['pinUp'] = pg.evaluate('window.__menu()')
                pg.evaluate('document.scrollingElement.scrollTop = 0; document.querySelector("#main").scrollTop = 0'); pg.wait_for_timeout(100)
            res.append(r)
    if MODE == 'matrix':
        for w, h in WIDTHS.items():
            for z in ZOOMS:
                run(w * 100 / z, h * 100 / z, 1, f'{w}x{h}@{z}%')
    elif MODE == 'scale':
        for w, h in ([(int(os.environ['QA_ONLY_W']),640)] if os.environ.get('QA_ONLY_W') else [(160,640),(180,640),(200,640),(235,640),(280,640),(320,568),(360,640),(390,844),(414,896),(768,1024),(1024,768),(1280,800),(1920,1080)]):
            for s in [0.85, 1, 1.1, 1.25, 1.3, 1.4, 1.5, 1.6]:
                run(w, h, s, f'{w}x{h} 글자{int(s*100)}%')
    elif MODE == 'tip':
        for w, h in [(360,640),(390,844),(320,568),(180,320),(768,1024),(1280,800),(1280/2,800/2),(360/2,640/2)]:
            for s in [1, 1.6]:
                run(w, h, s, f'{round(w)}x{round(h)} 팁 글자{int(s*100)}%', views=['home'], tips=True)
    b.close()
bad_tabs = [r for r in res if r['tabs'] and not all(t['ok'] for t in r['tabs'])]
bad_amt = [r for r in res if r['amtN']]
bad_tip = [r for r in res if r['tip'] and (r['tip']['pos'] == 'fixed' or r['tip']['overHeader'] or r['tip']['overTab'] or r['tip']['overRecent'] or r['tip']['covered'])]
over = [r for r in res if r['docOver'] > 0]
low = [r for r in res if r['H'] <= 500]
hdr2 = [r for r in res if (r['hdrLines'] or 0) > 1]
print(f'측정 {len(res)}건 | 탭 실패 {len(bad_tabs)} | 금액·날짜 문제 {len(bad_amt)} | 팁 가림 {len(bad_tip)} | 가로넘침 {len(over)} | 위메뉴 2줄 {len(hdr2)}')
def stat(rows, k):
    v = [r[k] for r in rows if r.get(k) is not None]
    return f'최대 {max(v)}% 평균 {sum(v)/len(v):.1f}%' if v else '-'
if low:
    print(f'낮은 화면(H≤500) {len(low)}건 — 고정 메뉴 비율(스크롤해도 붙어 있는 메뉴가 화면 안에서 차지하는 높이/화면 높이), 괄호는 위 메뉴(본문과 함께 스크롤됨)까지 더한 보이는 비율')
    for name, g in [('≤200%', [r for r in low if not ('@300%' in r['tag'] or '@400%' in r['tag'])]), ('300%', [r for r in low if '@300%' in r['tag']]), ('400%', [r for r in low if '@400%' in r['tag']])]:
        if g: print(f'   {name}: 맨 위 {stat(g,"pin")} ({stat(g,"menu")}) | 160px 내린 뒤 {stat(g,"pinDown")} ({stat(g,"menuDown")}) | 60px 올린 뒤 {stat(g,"pinUp")} ({stat(g,"menuUp")})')
    noscroll = [r for r in low if r.get('scrolled') is not None and r['scrolled'] < 100]
    if noscroll: print(f'   (내용이 짧아 160px까지 못 내려간 화면 {len(noscroll)}건 — 맨 끝에 닿으면 아래 메뉴가 다시 보임)')
# 큰 숫자 단조성: (폭, 화면, 순번)별로 배율 순서대로 글자 크기가 줄어들면 실패
from collections import defaultdict
grp = defaultdict(list)
for r in res:
    for f in r.get('fits') or []: grp[(r['W'], r['H'], r['view'], f[0])].append((r['scale'], f[1], f[3], f[4]))
shrink = []
for k, v in grp.items():
    v.sort()
    for (s0, f0, t0, c0), (s1, f1, t1, c1) in zip(v, v[1:]):
        if s1 > s0 and f1 < f0 - 0.2 and t0 == t1: shrink.append(f'{k[0]}x{k[1]} {k[2]} #{k[3]} {c1} "{t1}": 글자{int(s0*100)}% {f0}px → {int(s1*100)}% {f1}px')
labelbad = [f'{r["tag"]} {r["view"]} "{f[3]}" {f[1]}px < 라벨 {f[2]}px' for r in res for f in (r.get('fits') or []) if f[2] and f[1] < f[2] - 0.05]
nfit = sum(len(r.get('fits') or []) for r in res)
if MODE == 'scale':
    print(f'큰 숫자(data-fit) 측정 {nfit}개·{len(grp)}묶음 | 배율↑인데 작아짐 {len(shrink)} | 도넛 금액<라벨 {len(labelbad)}')
    for x in shrink[:12] + labelbad[:6]: print('  ', x)
tabw = [t['w'] for r in res if r['tabs'] for t in r['tabs']]
if tabw: print(f'탭 폭 최소 {min(tabw)}px, 높이 최소 {min(t["h"] for r in res if r["tabs"] for t in r["tabs"])}px')
for r in (bad_tabs[:4] + bad_amt[:12] + bad_tip[:4] + over[:4] + hdr2[:6]):
    print(' ', r['tag'], r['view'], 'tabs', [t['n'] for t in (r['tabs'] or []) if not t['ok']], 'amt', r['amt'], 'tip', r['tip'], 'over', r['docOver'], 'hdr', r['hdrLines'])
qa = [r for r in res if MODE != 'matrix' or int(r['tag'].split('@')[1][:-1]) <= 200]
fail = [r for r in qa if (r['tabs'] and not all(t['ok'] for t in r['tabs'])) or r['amtN'] or r['docOver'] > 0 or (r['tip'] and (r['tip']['pos'] == 'fixed' or r['tip']['overHeader'] or r['tip']['overTab'] or r['tip']['covered']))]
fail += [r for r in bad_tabs if r not in fail]  # 300·400% 에서도 아래 메뉴가 가려지면 실패(PR #29 QA: 쨈 컵이 '차트' 탭을 덮음)
sys.exit(1 if fail or shrink or labelbad else 0)
