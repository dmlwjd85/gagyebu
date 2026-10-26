"""쨈 컵 기록 버튼 연타 검사(QA 2차 D1 재현·회귀 방지). 실제 브라우저 포인터(mouse.click)로 버튼 자리를 연달아 누름.
폭 320/339/360/390/1280 × 간격 40/80/120/200/300ms × 12번 → 시트가 한 번만 열리고, 닫히지 않고, '저장'·바탕·✕ 에
누름이 하나도 닿지 않고, 오류 문구·흔들림·토스트가 0이어야 통과(5차: 자판은 막지 않음 → 320·339 에서는 컵 위 '8'·'0'이 입력될 수 있음, 금액도 출력. '8'이 10억 한도를 넘겨 생기는 금액 흔들림은 main 과 같은 입력 동작이라 허용).
보통 사용(잠시 뒤 바탕 눌러 닫기, 금액·분류 넣고 저장)도 확인.
컵 한 번 누른 뒤 0.25·0.3·0.35·0.4초에 자판 1·2·3·4(250ms·100ms 간격) → 금액 1,234원(QA 3차 N1 재현·회귀 방지).
마우스(mouse.click)와 터치(touchscreen.tap) 두 가지로 모두 돌림. 폭마다 시트가 열렸을 때 컵 누름 자리(반지름 25px)에 겹치는 시트 요소도 출력.
사용: python3 tools/qa/rapid_tap.py [앱 주소] [--emu-host=… --auth-port=… --fs-port=… --project=demo-…] (emu.py 참고)
      움직임 줄이기: QA_REDUCED=1 / 일부만: QA_WIDTHS=360,1280 QA_GAPS=120 QA_INPUTS=touch"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu
from playwright.sync_api import sync_playwright
URL = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
emu.reset()
WIDTHS = [(320, 640), (339, 700), (360, 780), (390, 844), (1280, 800)]
GAPS = [40, 80, 120, 200, 300]
REDUCED = os.environ.get('QA_REDUCED') == '1'
if os.environ.get('QA_WIDTHS'): WIDTHS = [x for x in WIDTHS if str(x[0]) in os.environ['QA_WIDTHS'].split(',')]  # 예: QA_WIDTHS=360,1280
if os.environ.get('QA_GAPS'): GAPS = [int(g) for g in os.environ['QA_GAPS'].split(',')]
INPUTS = os.environ.get('QA_INPUTS', 'mouse,touch').split(',')
KEY_DELAYS = [250, 300, 350, 400]  # 컵 누른 뒤 첫 숫자까지
KEY_GAPS = [250, 100]

WATCH = """() => { const t0 = performance.now(); const sr = document.getElementById('sheet-root'); const W = window.__w = { ev: [], reached: [], shake: 0, toast: 0 };
  let last = sr.classList.contains('open');
  new MutationObserver(() => { const o = sr.classList.contains('open'); if (o !== last) { W.ev.push([Math.round(performance.now() - t0), o]); last = o; } }).observe(sr, { attributes: true });
  new MutationObserver((ms) => { for (const m of ms) { const n = m.target; if (n.nodeType === 1) { if (n.id === 'toast' && n.classList.contains('show')) W.toast++; }
    for (const a of m.addedNodes || []) if (a.nodeType === 1) { if (a.id === 'toast') W.toast++; if (a.matches?.('.shake') || a.querySelector?.('.shake')) W.shake++; } } })
    .observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  document.addEventListener('click', (e) => { if (e.composedPath().includes(sr)) W.reached.push([Math.round(performance.now() - t0), (e.target.closest('[data-save]') ? 'SAVE ' : e.target.closest('[data-close]') ? 'CLOSE ' : '') + (e.target.closest('button,[data-close]') || e.target).outerHTML.slice(0, 50)]); });
  return true; }"""
STATE = """() => ({ ...window.__w, open: document.getElementById('sheet-root').classList.contains('open'),
  err: /입력해 주세요|선택해 주세요/.test(document.querySelector('#sheet-root .sheet')?.innerText || '') })"""

def login(pg):
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.reload(); pg.wait_for_timeout(1500)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(3000)
    if pg.locator('text=나중에 고를게요').count(): pg.click('text=나중에 고를게요'); pg.wait_for_timeout(2500)

def fab_center(pg):
    return pg.evaluate("""() => { const f = [...document.querySelectorAll('.fab')].find((e) => e.offsetParent); const r = f.getBoundingClientRect();
      const d = f.querySelector('.fab-disc').getBoundingClientRect(); return [r.x + r.width / 2, d.y + d.height / 2]; }""")

def tap(pg, kind, x, y):
    if kind == 'touch': pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)

def key_xy(pg, k, scroll=False):  # 시트가 올라오는 중이어도 지금 보이는 자리(transform 포함). 아직 화면에 안 보이면 사람처럼 보일 때까지 기다림
    if scroll:  # 다 열린 뒤: 작은 화면(320×640)에서 맨 아랫줄(000·0·⌫)은 시트를 굴려야 보임
        pg.evaluate(f"""document.querySelector('#sheet-root [data-key="{k}"]')?.scrollIntoView({{ block: 'nearest' }})"""); pg.wait_for_timeout(50)
    prev = None
    for _ in range(100):
        r = pg.evaluate(f"""() => {{ const e = document.querySelector('#sheet-root.open [data-key="{k}"]'); if (!e) return null; const r = e.getBoundingClientRect();
          const y = r.y + r.height / 2; return y < innerHeight - 2 ? [r.x + r.width / 2, y] : null; }}""")
        if r and prev and abs(r[1] - prev[1]) <= 2: return r  # 움직이는 과녁은 사람도 못 누름: 한 프레임에 2px 넘게 움직이면 멈출 때까지(1280 시트는 0.53초까지 이동)
        prev = r; pg.wait_for_timeout(16)
    return None

AMOUNT = "() => document.querySelector('#sheet-root .amount-display')?.getAttribute('aria-label') || ''"
ZONE = """() => { const f = [...document.querySelectorAll('.fab')].find((e) => e.offsetParent); const r = f.getBoundingClientRect(); const P = 25;
  const d = f.querySelector('.fab-disc').getBoundingClientRect(); const cx = r.x + r.width / 2, cy = d.y + d.height / 2;
  const z = { l: cx - P, r: cx + P, t: cy - P, b: cy + P }; const out = new Set();
  for (const e of document.querySelectorAll('#sheet-root button, #sheet-root input, #sheet-root [data-close]')) { const q = e.getBoundingClientRect();
    if (q.width && q.right > z.l && q.left < z.r && q.bottom > z.t && q.top < z.b) out.add((e.getAttribute('aria-label') || e.dataset.key || e.innerText || e.className).trim().slice(0, 12)); }
  return [...out]; }"""

fails, rows = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    for kind in INPUTS:
     for w, h in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, locale='ko-KR', has_touch=kind == 'touch', is_mobile=kind == 'touch' and w < 1024,
                            reduced_motion='reduce' if REDUCED else 'no-preference')
        ctx.add_init_script("window.__pd = []; addEventListener('pointerdown', (e) => __pd.push(e.timeStamp), true)")  # 앱보다 먼저: 실제 누름 간격 기록
        T = '터치' if kind == 'touch' else '마우스' 
        lp = ctx.new_page(); login(lp)  # 로그인은 IndexedDB 에 남음 → 같은 컨텍스트의 새 탭마다 깨끗한 페이지로 검사
        def page(): return lp, ctx.new_page()
        for gap in GAPS:
          for attempt in range(3):  # 공용 컴퓨터가 바빠 브라우저가 0.4초 넘게 멈추면(실제 누름 간격 > 0.4초) 그 회차는 무효로 보고 다시
            c, pg = page(); pg.goto(URL); pg.wait_for_timeout(1500)
            x, y = fab_center(pg); pg.evaluate(WATCH); pg.evaluate("window.__pd.length = 0")
            for _ in range(12): tap(pg, kind, x, y); pg.wait_for_timeout(gap)
            pg.wait_for_timeout(900); r = pg.evaluate(STATE)
            pd = pg.evaluate("window.__pd"); mx = max((b2 - a2 for a2, b2 in zip(pd, pd[1:])), default=0)
            if mx > 400 and attempt < 2: rows.append(f"{T} {w}px {gap:>3}ms×12  실제 누름 간격 최대 {mx:.0f}ms(브라우저 지연) → 무효, 다시"); pg.close(); continue
            opens = sum(1 for _, o in r['ev'] if o); closes = sum(1 for _, o in r['ev'] if not o)
            bad = [x for x in r['reached'] if x[1].startswith(('SAVE', 'CLOSE'))]; amt = pg.evaluate(AMOUNT)
            keys = len(r['reached']) - len(bad)
            ok = r['open'] and opens == 1 and closes == 0 and not bad and (not r['shake'] or keys >= 10) and not r['toast'] and not r['err']  # 흔들림은 자판이 10억 한도까지 입력됐을 때(main 과 같음)만 허용
            rows.append(f"{T} {w}px {gap:>3}ms×12  (실제 간격 최대 {mx:.0f}ms)  열림 {opens} 닫힘 {closes} 끝상태 {'열림' if r['open'] else '닫힘'}  저장·바탕에 닿은 누름 {len(bad)} (자판 {len(r['reached']) - len(bad)}, 금액 {amt or '없음'})  흔들림 {r['shake']} 토스트 {r['toast']} 오류문구 {int(r['err'])}  {'통과' if ok else '실패'}")
            if not ok: fails.append(rows[-1]); pg.screenshot(path=f'/tmp/rapid-fail-{kind}-{w}-{gap}.png')
            pg.close(); break
        # 보통 사용 ① 한 번 누르고 잠시 뒤 바탕을 눌러 닫기
        c, pg = page(); pg.goto(URL); pg.wait_for_timeout(1500); x, y = fab_center(pg)
        tap(pg, kind, x, y); pg.wait_for_timeout(900)
        rows.append(f"{T} {w}px 시트가 열렸을 때 컵 누름 자리(반지름 25px)에 겹치는 시트 요소: {', '.join(pg.evaluate(ZONE)) or '없음'}")
        top = pg.evaluate("document.querySelector('#sheet-root .sheet').getBoundingClientRect().top")
        bx, by = (w / 2, top / 2) if w < 1024 else (40, h / 2)  # 시트 밖에 보이는 바탕
        if kind == 'touch' and w < 1024 and top < 48:  # 바탕이 손가락보다 얇으면(터치 보정이 시트로 붙임, main 도 같음) ✕ 로 닫기
            bx, by = pg.evaluate("(() => { const r = document.querySelector('#sheet-root [data-close].icon-btn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
        tap(pg, kind, bx, by); pg.wait_for_timeout(500)
        closed = not pg.evaluate("document.getElementById('sheet-root').classList.contains('open')")
        # ② 다시 열어 자판으로 금액 → 첫 분류 → 저장 → 시트가 닫히고 저장 토스트
        tap(pg, kind, x, y); pg.wait_for_timeout(900); pg.evaluate(WATCH)
        amount = str(w) + str(os.getpid() % 90 + 10)  # 폭·실행마다 다른 금액(같은 금액이면 '중복인가요?'가 뜸)
        for k in amount:
            tap(pg, kind, *key_xy(pg, k, scroll=True)); pg.wait_for_timeout(120)
        pg.locator('#sheet-root .cat-chip').first.tap() if kind == 'touch' else pg.locator('#sheet-root .cat-chip').first.click()
        pg.wait_for_timeout(200)
        pg.locator('#sheet-root [data-save]').tap() if kind == 'touch' else pg.locator('#sheet-root [data-save]').click()
        pg.wait_for_timeout(500)
        if pg.locator('text=그래도 저장').count(): pg.click('text=그래도 저장')
        pg.wait_for_timeout(700)
        s = pg.evaluate(STATE)
        saved = not s['open'] and s['toast'] >= 1
        rows.append(f"{T} {w}px 보통 사용: 0.9초 뒤 {'✕' if kind == 'touch' and w < 1024 and top < 48 else '바탕'}(y={by:.0f}) 눌러 닫힘 {'예' if closed else '아니오'} / {amount}원 저장 후 닫힘·토스트 {'예' if saved else '아니오'}  {'통과' if closed and saved else '실패'}")
        if not (closed and saved): fails.append(rows[-1]); pg.screenshot(path=f'/tmp/rapid-fail-{kind}-{w}-normal.png')
        pg.close()
        # ③ 컵 한 번 → 0.25~0.4초 뒤 자판 1·2·3·4 → 1,234원(무시 창이 자판까지 번지면 0원, QA 3차 N1)
        for d in KEY_DELAYS:
            for kg in KEY_GAPS:
                c, pg = page(); pg.goto(URL); pg.wait_for_timeout(1500); x, y = fab_center(pg); pg.evaluate(WATCH)
                t0 = pg.evaluate('performance.now()'); tap(pg, kind, x, y); pg.wait_for_timeout(d); first = None
                for k in '1234':
                    xy = key_xy(pg, k)
                    if first is None: first = round(pg.evaluate('performance.now()') - t0)
                    if xy: tap(pg, kind, *xy)
                    pg.wait_for_timeout(kg)
                pg.wait_for_timeout(500); a = pg.evaluate(AMOUNT); r = pg.evaluate(STATE)
                ok = '1,234' in a and r['open'] and not r['err'] and not r['shake']
                rows.append(f"{T} {w}px 컵 1번 → {d}ms 뒤(첫 숫자 실제 {first}ms) 자판 1·2·3·4({kg}ms 간격): {a or '시트 없음'}  {'통과' if ok else '실패'}")
                if not ok: fails.append(rows[-1]); pg.screenshot(path=f'/tmp/rapid-fail-{kind}-{w}-key{d}-{kg}.png')
                pg.close()
        ctx.close()
    b.close()
print(('[움직임 줄이기] ' if REDUCED else '') + f'{len(rows)}개 검사')
print('\n'.join(rows))
print(f'\n실패 {len(fails)}건' if fails else '\n모두 통과')
sys.exit(1 if fails else 0)
