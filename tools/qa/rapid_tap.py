"""쨈 컵 기록 버튼 연타 검사(QA 2차 D1 재현·회귀 방지). 실제 브라우저 포인터(mouse.click)로 버튼 자리를 연달아 누름.
폭 320/339/360/390/1280 × 간격 40/80/120/200/300ms × 12번 → 시트가 한 번만 열리고, 닫히지 않고, 시트 안(바탕·저장·자판)에
누름이 하나도 닿지 않고, 오류 문구·흔들림·토스트가 0이어야 통과. 보통 사용(잠시 뒤 바탕 눌러 닫기, 금액·분류 넣고 저장)도 확인.
사용: python3 tools/qa/rapid_tap.py [앱 주소] [--emu-host=… --auth-port=… --fs-port=… --project=demo-…] (emu.py 참고)
      움직임 줄이기: QA_REDUCED=1 / 일부만: QA_WIDTHS=360,1280 QA_GAPS=120"""
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

WATCH = """() => { const t0 = performance.now(); const sr = document.getElementById('sheet-root'); const W = window.__w = { ev: [], reached: [], shake: 0, toast: 0 };
  let last = sr.classList.contains('open');
  new MutationObserver(() => { const o = sr.classList.contains('open'); if (o !== last) { W.ev.push([Math.round(performance.now() - t0), o]); last = o; } }).observe(sr, { attributes: true });
  new MutationObserver((ms) => { for (const m of ms) { const n = m.target; if (n.nodeType === 1) { if (n.id === 'toast' && n.classList.contains('show')) W.toast++; }
    for (const a of m.addedNodes || []) if (a.nodeType === 1) { if (a.id === 'toast') W.toast++; if (a.matches?.('.shake') || a.querySelector?.('.shake')) W.shake++; } } })
    .observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  document.addEventListener('click', (e) => { if (e.composedPath().includes(sr)) W.reached.push([Math.round(performance.now() - t0), (e.target.closest('button,[data-close]') || e.target).outerHTML.slice(0, 50)]); });
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

fails, rows = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    for w, h in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, locale='ko-KR',
                            reduced_motion='reduce' if REDUCED else 'no-preference')
        lp = ctx.new_page(); login(lp)  # 로그인은 IndexedDB 에 남음 → 같은 컨텍스트의 새 탭마다 깨끗한 페이지로 검사
        def page(): return lp, ctx.new_page()
        for gap in GAPS:
            c, pg = page(); pg.goto(URL); pg.wait_for_timeout(1500)
            x, y = fab_center(pg); pg.evaluate(WATCH)
            for _ in range(12): pg.mouse.click(x, y); pg.wait_for_timeout(gap)
            pg.wait_for_timeout(900); r = pg.evaluate(STATE)
            opens = sum(1 for _, o in r['ev'] if o); closes = sum(1 for _, o in r['ev'] if not o)
            ok = r['open'] and opens == 1 and closes == 0 and not r['reached'] and not r['shake'] and not r['toast'] and not r['err']
            rows.append(f"{w}px {gap:>3}ms×12  열림 {opens} 닫힘 {closes} 끝상태 {'열림' if r['open'] else '닫힘'}  시트에 닿은 누름 {len(r['reached'])}  흔들림 {r['shake']} 토스트 {r['toast']} 오류문구 {int(r['err'])}  {'통과' if ok else '실패'}")
            if not ok: fails.append(rows[-1]); pg.screenshot(path=f'/tmp/rapid-fail-{w}-{gap}.png')
            pg.close()
        # 보통 사용 ① 한 번 누르고 잠시 뒤 바탕을 눌러 닫기
        c, pg = page(); pg.goto(URL); pg.wait_for_timeout(1500); x, y = fab_center(pg)
        pg.mouse.click(x, y); pg.wait_for_timeout(900)
        top = pg.evaluate("document.querySelector('#sheet-root .sheet').getBoundingClientRect().top")
        bx, by = (w / 2, top / 2) if w < 1024 else (40, h / 2)  # 시트 밖에 보이는 바탕
        pg.mouse.click(bx, by); pg.wait_for_timeout(500)
        closed = not pg.evaluate("document.getElementById('sheet-root').classList.contains('open')")
        # ② 다시 열어 자판으로 금액 → 첫 분류 → 저장 → 시트가 닫히고 저장 토스트
        pg.mouse.click(x, y); pg.wait_for_timeout(900); pg.evaluate(WATCH)
        amount = str(w) + str(os.getpid() % 90 + 10)  # 폭·실행마다 다른 금액(같은 금액이면 '중복인가요?'가 뜸)
        for k in amount:
            r = pg.evaluate(f"""() => {{ const e = document.querySelector('#sheet-root [data-key="{k}"]'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}""")
            pg.mouse.click(*r); pg.wait_for_timeout(120)
        pg.locator('#sheet-root .cat-chip').first.click(); pg.wait_for_timeout(200)
        pg.locator('#sheet-root [data-save]').click(); pg.wait_for_timeout(500)
        if pg.locator('text=그래도 저장').count(): pg.click('text=그래도 저장')
        pg.wait_for_timeout(700)
        s = pg.evaluate(STATE)
        saved = not s['open'] and s['toast'] >= 1
        rows.append(f"{w}px 보통 사용: 0.9초 뒤 바탕(y={by:.0f}) 눌러 닫힘 {'예' if closed else '아니오'} / {amount}원 저장 후 닫힘·토스트 {'예' if saved else '아니오'}  {'통과' if closed and saved else '실패'}")
        if not (closed and saved): fails.append(rows[-1]); pg.screenshot(path=f'/tmp/rapid-fail-{w}-normal.png')
        pg.close(); ctx.close()
    b.close()
print(('[움직임 줄이기] ' if REDUCED else '') + f'{len(rows)}개 검사')
print('\n'.join(rows))
print(f'\n실패 {len(fails)}건' if fails else '\n모두 통과')
sys.exit(1 if fails else 0)
