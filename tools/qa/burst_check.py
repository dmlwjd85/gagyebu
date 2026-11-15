"""쨈 컵 '피어남' 검사(6차 보완). 컵을 한 번 누르고 650ms 동안 프레임마다:
- 복사본(.fab-ghost)·쨈/호일 조각(.jam-bit)에서 지금 보이는 부분(투명도 0.02 이하는 뺌)이 시트의 자판·저장·카테고리·지출/수입·✕·문자 붙여넣기·금액 글자를
  가리는 시간(첫~마지막 겹친 프레임, ms)과 대상별 프레임 수
- 그 자리 누름이 시트로 가는지(복사본·조각 자리 elementFromPoint 가 시트 안) → 가리는 동안에도 누름 통과
- 시트 펼침(mask)이 언제 풀리는지, 처음 프레임에 시트가 컵 자리에서 작게(지름 48px) 시작했는지, clip-path 는 쓰지 않는지
- 시트가 열린 뒤 프레임마다 자판 1·저장 가운데 누름이 시트로 가는지(펼침·이동 중에도 누름이 바탕으로 빠지지 않음, 4차 D1)
통과: 복사본·조각 누름 통과, 자판 1·저장 누름이 매 프레임 시트로 감, 복사본은 화면에 보이고 자판·저장을 가리는 시간 200ms 이하, 조각은 520ms 안에 모두 사라짐, 휴대폰 폭은 펼침이 400ms 안에 끝남.
PC(1280)는 '기록'이 본문 아래 가운데(#30)라 시트와 겹침 → 같은 '탁'·조각(가림 200ms 이하), 시트 펼침은 없음.
폭 320/339/360/390/1280 × 밝음·어둠. QA_REDUCED=1 이면 움직임 줄이기(펼침·조각 없음, 색 변화만).
사용: python3 tools/qa/burst_check.py [앱 주소] [--emu-host=… --auth-port=… --fs-port=… --project=demo-…] (emu.py 참고)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu
from playwright.sync_api import sync_playwright
URL = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
emu.reset()
WIDTHS = [(320, 640), (339, 700), (360, 780), (390, 844), (1280, 800)]
if os.environ.get('QA_WIDTHS'): WIDTHS = [x for x in WIDTHS if str(x[0]) in os.environ['QA_WIDTHS'].split(',')]
REDUCED = os.environ.get('QA_REDUCED') == '1'
SAMPLE = """() => new Promise((done) => {
  const T = ['key', 'save', 'cat', 'more', 'kind', 'close', 'sms'].map((k) => `#sheet-root .sheet [data-${k}]`).join(', '); // 바탕(시트 밖 data-close)은 뺌
  const name = (e) => e.dataset.key != null ? '자판' : e.matches('[data-save]') ? '저장' : e.dataset.cat || e.matches('[data-more]') ? '카테고리' : e.dataset.kind ? '지출/수입' : e.matches('[data-close]') ? '✕' : '문자 붙여넣기';
  const hit = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
  const alpha = (e) => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
  const sheet = document.querySelector('#sheet-root .sheet');
  const R = { ghost: { first: null, last: null, frames: {} }, bits: { first: null, last: null, frames: {} }, seen: false, pass: true, ghostMs: 0, bitsMs: 0, clipFirst: null, clipEnd: null, clipPath: false, maxGhosts: 0, keyMiss: [] };
  const t0 = performance.now();
  const step = () => {
    const t = Math.round(performance.now() - t0);
    const tg = [...document.querySelectorAll(T)].filter((e) => e.offsetParent).map((e) => [name(e), e.getBoundingClientRect()]);
    const amt = document.querySelector('#sheet-root .amount-display');
    if (amt) { const r = document.createRange(); r.selectNodeContents(amt); tg.push(['금액 글자', r.getBoundingClientRect()]); }
    const gs = document.querySelectorAll('.fab-ghost'); R.maxGhosts = Math.max(R.maxGhosts, gs.length);
    const groups = { ghost: gs[0] ? [gs[0].querySelector('.fab-disc'), ...gs[0].querySelectorAll('.cup-body, .cup-lid, .cup-blob, .cup-word, .cup-pp')] : [], bits: [...document.querySelectorAll('.jam-bit')] };
    for (const [k, els] of Object.entries(groups)) {
      const vis = els.filter((e) => e && alpha(e) > .02);
      if (k === 'ghost' && vis.length) { R.ghostMs = t; const d = vis[0].getBoundingClientRect(); if (d.bottom > 0 && d.top < innerHeight) R.seen = true; }
      if (k === 'bits' && vis.length) R.bitsMs = t;
      let any = false;
      for (const e of vis) { const p = e.getBoundingClientRect();
        for (const [n, b] of tg) if (hit(p, b)) { R[k].frames[n] = (R[k].frames[n] || 0) + 1; if (n === '자판' || n === '저장') any = true; }
        const c = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); // 그 자리 누름이 어디로 가나
        if (c && c.closest('.fab-ghost, .jam-burst')) R.pass = false; }
      if (any) { R[k].first ??= t; R[k].last = t; }
    }
    const cs = getComputedStyle(sheet), clip = cs.maskSize || cs.webkitMaskSize || 'auto';
    if (R.clipFirst == null) R.clipFirst = clip;
    if (clip !== 'auto' && clip !== R.lastSize) { R.clipEnd = t; R.lastSize = clip; } // 원 크기가 마지막으로 바뀐 때 = 펼침 끝(다 펼친 뒤 mask 가 풀리는 520ms 는 보이는 변화 없음)
    if (cs.clipPath !== 'none') R.clipPath = true;
    if (document.getElementById('sheet-root').classList.contains('open')) // 지금 보이는 자판 1·저장 가운데를 누르면 어디로 가나
      for (const q of ['#sheet-root [data-key="1"]', '#sheet-root [data-save]']) { const e = document.querySelector(q), b = e?.getBoundingClientRect();
        if (!b || b.bottom > innerHeight || b.top < 0) continue; const c = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!e.contains(c)) R.keyMiss.push([t, q.includes('save') ? '저장' : '1', (c?.className || c?.tagName || '').toString().slice(0, 20)]); }
    if (performance.now() - t0 < 650) requestAnimationFrame(step); else done(R);
  };
  requestAnimationFrame(step); // 클릭 처리 뒤 첫 프레임부터
})"""
def login(pg):
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.reload(); pg.wait_for_timeout(1500)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(3000)
    if pg.locator('text=나중에 고를게요').count(): pg.click('text=나중에 고를게요'); pg.wait_for_timeout(2500)
FAB = "(()=>{const f=[...document.querySelectorAll('.fab, .desk-fab')].find(e=>e.getClientRects().length);const r=f.getBoundingClientRect();const d=f.querySelector('.fab-disc').getBoundingClientRect();return [r.x+r.width/2,d.y+d.height/2]})()"
cover = lambda g: f"{g['last'] - g['first'] + 16}ms" if g['first'] is not None else '0ms'
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    for w, h in WIDTHS:
        for sc in ('light', 'dark'):
            mobile = w < 1024
            c = b.new_context(viewport={'width': w, 'height': h}, locale='ko-KR', color_scheme=sc, has_touch=mobile, is_mobile=mobile, reduced_motion='reduce' if REDUCED else 'no-preference')
            pg = c.new_page(); login(pg); pg.goto(URL); pg.wait_for_timeout(1500)
            x, y = pg.evaluate(FAB)
            # 누르기 직전에 샘플러를 걸어 둠(클릭 뒤 첫 프레임부터)
            pg.evaluate(f"window.__r = null; addEventListener('click', () => ({SAMPLE})().then((r) => window.__r = r), {{ once: true, capture: true }})")
            if mobile: pg.touchscreen.tap(x, y)
            else: pg.mouse.click(x, y)
            pg.wait_for_function("window.__r", timeout=5000); R = pg.evaluate("window.__r")
            g, bt = R['ghost'], R['bits']
            gcov = 0 if g['first'] is None else g['last'] - g['first'] + 16
            if mobile and not REDUCED:
                ok = R['pass'] and R['seen'] and R['maxGhosts'] == 1 and gcov <= 200 and R['bitsMs'] <= 520 and R['bitsMs'] > 0 and '48px' in R['clipFirst'] and R['clipEnd'] is not None and R['clipEnd'] <= 400
            elif mobile:  # 움직임 줄이기: 펼침·조각 없음
                ok = R['pass'] and R['seen'] and R['bitsMs'] == 0 and R['clipEnd'] is None and gcov <= 200
            else:  # PC: '기록'이 아래 가운데라 시트와 겹침 → 같은 '탁'·조각, 시트는 원래대로(펼침 없음). 움직임 줄이기는 조각 없음
                ok = R['pass'] and R['seen'] and R['maxGhosts'] == 1 and gcov <= 200 and R['clipEnd'] is None and (R['bitsMs'] == 0 if REDUCED else 0 < R['bitsMs'] <= 520)
            ok = ok and not R['keyMiss'] and not R['clipPath']
            bad += not ok
            print(f"{w}px {'밝음' if sc == 'light' else '어둠'}{' 움직임 줄이기' if REDUCED else ''}: 복사본 {R['maxGhosts']}개(마지막으로 보인 때 {R['ghostMs']}ms) · 자판·저장 가림 {cover(g)} {g['frames'] or ''} · "
                  f"조각 마지막 {R['bitsMs']}ms, 자판·저장 가림 {cover(bt)} {bt['frames'] or ''} · 누름 통과 {'예' if R['pass'] else '아니오'} · "
                  f"펼침 시작 {R['clipFirst'][:24]} 끝 {R['clipEnd']}ms · 자판1·저장 누름 빠짐 {len(R['keyMiss'])}프레임{' ' + str(R['keyMiss'][:3]) if R['keyMiss'] else ''}{' · clip-path 있음' if R['clipPath'] else ''}  {'통과' if ok else '실패'}", flush=True)
            c.close()
    b.close()
print('모두 통과' if not bad else f'실패 {bad}건'); sys.exit(1 if bad else 0)
