"""줌·글자 배율 자동 점검(PR #9 QA 재발 방지).
사용: python3 tools/qa/zoom_check.py [URL] [matrix|scale|tip] [demo|huge]
 - matrix: 화면 9종(320×568 ~ 1920×1080) × 브라우저 줌 25~400% (QA의 108조합 + 300·400%)
 - scale : 폭 160~1920px × 본문 글자 85~160%
 - tip   : 팁이 메뉴·기록·토스트를 가리지 않는지
 - huge  : 아주 큰 금액(9억대 수입·1억대 지출)을 더해서 검사
 화면마다 아래 메뉴 5개(화면 안·눌림), 금액·날짜 줄갈림/말줄임/잘림, 팁 가림, 가로 넘침, 낮은 화면 메뉴 비율을 잼.
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
CHECK = r"""(opts) => {
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
  // 4) 낮은 화면: 본문을 조금 내린 상태에서 화면에 늘 붙어 있는 메뉴가 차지하는 비율
  const sc = getComputedStyle(root).overflowY !== 'visible' ? root : document.scrollingElement;
  sc.scrollTop = 160;
  const stuck = [document.querySelector('.app-top'), tb].filter((e) => e && vis(e)).reduce((a, e) => { const r = e.getBoundingClientRect(); return a + Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)); }, 0);
  sc.scrollTop = 0;
  out.menu = Math.round(stuck / H * 100);
  out.docOver = document.documentElement.scrollWidth - W;
  out.hdrLines = (() => { const h = document.querySelector('.app-top header'); if (!h) return null; const tops = new Set([...h.querySelectorAll('button,.offline-badge,svg')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 22); })); return tops.size; })();
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', reduced_motion='reduce')
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
            r = pg.evaluate(CHECK, {}); r.update(tag=tag, view=v, W=round(W), H=round(H), scale=scale); res.append(r)
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
if low: print(f'낮은 화면(H≤500) {len(low)}건: 메뉴 비율 최대 {max(r["menu"] for r in low)}%, 평균 {sum(r["menu"] for r in low)/len(low):.0f}%')
tabw = [t['w'] for r in res if r['tabs'] for t in r['tabs']]
if tabw: print(f'탭 폭 최소 {min(tabw)}px, 높이 최소 {min(t["h"] for r in res if r["tabs"] for t in r["tabs"])}px')
for r in (bad_tabs[:4] + bad_amt[:12] + bad_tip[:4] + over[:4] + hdr2[:6]):
    print(' ', r['tag'], r['view'], 'tabs', [t['n'] for t in (r['tabs'] or []) if not t['ok']], 'amt', r['amt'], 'tip', r['tip'], 'over', r['docOver'], 'hdr', r['hdrLines'])
qa = [r for r in res if MODE != 'matrix' or int(r['tag'].split('@')[1][:-1]) <= 200]
fail = [r for r in qa if (r['tabs'] and not all(t['ok'] for t in r['tabs'])) or r['amtN'] or r['docOver'] > 0 or (r['tip'] and (r['tip']['pos'] == 'fixed' or r['tip']['overHeader'] or r['tip']['overTab'] or r['tip']['covered']))]
sys.exit(1 if fail else 0)
