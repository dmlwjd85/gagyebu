"""컵 한 번 누른 직후 다른 입력 경로가 main 과 똑같이 동작하는지 비교(QA 3차 N1·N2, 회귀 0 확인).
컵을 누르고 0.3초 뒤(시트가 막 올라오는 중) 자판·입력칸·카테고리·지출/수입·닫기·실제 키보드 숫자·화면 낭독기 초점, 그리고 키보드 Enter 연타를 해 보고
결과 값을 주소마다 나란히 출력. 첫 주소를 기준(main)으로 보고 다르면 '다름' 표시.
사용: python3 tools/qa/after_tap.py 기준주소(main) 비교주소(이 PR) [--emu-host=… --auth-port=… --fs-port=… --project=demo-…]
      일부만: QA_WIDTHS=360,1280 QA_INPUTS=mouse"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu
from playwright.sync_api import sync_playwright
URLS = [emu.app_url(u) for u in sys.argv[1:3]]
emu.reset()
WIDTHS = [(320, 640), (360, 780), (390, 844), (1280, 800)]
if os.environ.get('QA_WIDTHS'): WIDTHS = [x for x in WIDTHS if str(x[0]) in os.environ['QA_WIDTHS'].split(',')]
INPUTS = os.environ.get('QA_INPUTS', 'mouse,touch').split(',')
DELAY = 300

def login(pg, url):
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.reload(); pg.wait_for_timeout(1500)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(3000)
    if pg.locator('text=나중에 고를게요').count(): pg.click('text=나중에 고를게요'); pg.wait_for_timeout(2500)

def xy(pg, sel):  # 열린 시트 안에서 지금 화면에 보이는 자리(안 보이면 보일 때까지)
    prev = None
    for _ in range(100):
        r = pg.evaluate("""(s) => { const e = document.querySelector('#sheet-root.open ' + s); if (!e) return null; const r = e.getBoundingClientRect();
          const y = r.y + r.height / 2; return r.width && y < innerHeight - 2 && y > 0 ? [r.x + r.width / 2, y] : null; }""", sel)
        if r and prev and abs(r[1] - prev[1]) <= 2: return r  # 움직이는 과녁은 멈출 때 누름(rapid_tap.py 와 같음)
        prev = r; pg.wait_for_timeout(16)
    raise RuntimeError('안 보임: ' + sel)

def tap(pg, kind, p):
    if kind == 'touch': pg.touchscreen.tap(*p)
    else: pg.mouse.click(*p)

FAB = "(() => { const f = [...document.querySelectorAll('.fab, .desk-fab')].find((e) => e.getClientRects().length); const r = f.getBoundingClientRect(); const d = f.querySelector('.fab-disc').getBoundingClientRect(); return [r.x + r.width / 2, d.y + d.height / 2]; })()"
Q = {
  'amount': "document.querySelector('#sheet-root .amount-display')?.getAttribute('aria-label')?.replace('금액 ', '') || '-'",
  'open': "document.getElementById('sheet-root').classList.contains('open') ? '열림' : '닫힘'",
  'err': "(document.querySelector('#sheet-root [role=alert]')?.innerText || '').trim() || '오류 없음'",
  'focus': "(() => { const a = document.activeElement; if (!a || a === document.body) return 'body'; if (a.matches('.fab, .desk-fab')) return '컵 버튼'; if (a.matches('#sheet-root .sheet')) return '시트(dialog)'; return (a.getAttribute('aria-label') || a.name || a.tagName).slice(0, 14); })()",
}
def q(pg, k): return pg.evaluate(Q[k])

def open_cup(pg, kind):
    tap(pg, kind, pg.evaluate(FAB)); pg.wait_for_timeout(DELAY)

def sc_keypad(pg, kind):
    open_cup(pg, kind)
    for k in '1234': tap(pg, kind, xy(pg, f'[data-key="{k}"]')); pg.wait_for_timeout(250)
    pg.wait_for_timeout(300); return q(pg, 'amount')
def sc_field(pg, kind):
    open_cup(pg, kind); tap(pg, kind, xy(pg, '[data-opts]')); pg.wait_for_timeout(300)
    tap(pg, kind, xy(pg, 'input[name=memo]')); pg.wait_for_timeout(150); pg.keyboard.type('점심', delay=60); pg.wait_for_timeout(200)
    memo = pg.evaluate("document.querySelector('#sheet-root input[name=memo]')?.value")
    return f"메모='{memo}' 초점={q(pg, 'focus')}"
def sc_cat(pg, kind):
    open_cup(pg, kind); tap(pg, kind, xy(pg, '.cat-chip[data-cat]')); pg.wait_for_timeout(300)
    return '선택됨' if pg.evaluate("document.querySelector('#sheet-root .cat-chip[data-cat]').getAttribute('aria-checked')") == 'true' else '안 됨'
def sc_kind(pg, kind):
    open_cup(pg, kind); tap(pg, kind, xy(pg, '[data-kind=income]')); pg.wait_for_timeout(300)
    return '수입' if pg.evaluate("document.querySelector('#sheet-root [data-kind=income]')?.getAttribute('aria-checked')") == 'true' else '지출 그대로'
def sc_close(pg, kind):
    open_cup(pg, kind); tap(pg, kind, xy(pg, '.icon-btn[data-close]')); pg.wait_for_timeout(600)
    return f"{q(pg, 'open')} 초점={q(pg, 'focus')}"
def sc_hwkey(pg, kind):
    open_cup(pg, kind); pg.keyboard.type('1234', delay=100); pg.wait_for_timeout(300)
    return q(pg, 'amount')
def sc_sr(pg, kind):
    open_cup(pg, kind); pg.wait_for_timeout(500); a = q(pg, 'focus')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    return f"열린 뒤 {a} → Esc 뒤 {q(pg, 'focus')}"
def sc_enter12(pg, kind):  # 컵에 초점 두고 Enter 80ms × 12 (QA 3차 N2), 이어서 금액·분류·Enter 저장
    pg.evaluate("[...document.querySelectorAll('.fab, .desk-fab')].find((e) => e.getClientRects().length).focus()")
    for _ in range(12): pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    pg.wait_for_timeout(500); r = f"{q(pg, 'open')} {q(pg, 'err')}"
    pg.keyboard.type('5000', delay=60); pg.wait_for_timeout(150)
    pg.evaluate("document.querySelector('#sheet-root .cat-chip[data-cat]').click()"); pg.wait_for_timeout(150)
    pg.evaluate("document.querySelector('#sheet-root .sheet').focus()"); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    if pg.locator('text=그래도 저장').count(): pg.click('text=그래도 저장'); pg.wait_for_timeout(500)
    return f"{r} / 5000+분류+Enter → {'저장(닫힘)' if q(pg, 'open') == '닫힘' else '안 됨 ' + q(pg, 'err')}"
def sc_enter_tab(pg, kind):  # Enter 로 열고 곧바로 숫자·Tab
    pg.evaluate("[...document.querySelectorAll('.fab, .desk-fab')].find((e) => e.getClientRects().length).focus()")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(DELAY); pg.keyboard.type('12', delay=60); pg.keyboard.press('Tab'); pg.wait_for_timeout(200)
    return f"{q(pg, 'amount')} Tab 뒤 초점={q(pg, 'focus')}"

SC = [('자판 1·2·3·4(250ms)', sc_keypad, 'all'), ('입력칸(옵션→메모) 탭·글자', sc_field, 'all'), ('카테고리 선택', sc_cat, 'all'),
      ('지출→수입 전환', sc_kind, 'all'), ('닫기 ✕', sc_close, 'all'), ('실제 키보드 숫자 1234', sc_hwkey, 'mouse'),
      ('낭독기 초점(열림·Esc)', sc_sr, 'mouse'), ('Enter 80ms×12 → 저장', sc_enter12, 'mouse'), ('Enter 열기 → 숫자·Tab', sc_enter_tab, 'mouse')]
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    for ui, url in enumerate(URLS):
        for kind in INPUTS:
            for w, h in WIDTHS:
                ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, locale='ko-KR', has_touch=kind == 'touch', is_mobile=kind == 'touch' and w < 1024)
                lp = ctx.new_page(); login(lp, url)
                for name, fn, only in SC:
                    if only != 'all' and only != kind: continue
                    pg = ctx.new_page(); pg.goto(url); pg.wait_for_timeout(1500)
                    try: v = fn(pg, kind)
                    except Exception as e: v = '오류: ' + str(e)[:40]
                    res[(name, kind, w, ui)] = v; pg.close()
                ctx.close()
    b.close()
print('| 경로 | 입력 | 폭 | main | 이 PR | 같음 |\n|---|---|---|---|---|---|')
diff = 0
for name, fn, only in SC:
    for kind in INPUTS:
        if only != 'all' and only != kind: continue
        for w, _ in WIDTHS:
            a, c = res.get((name, kind, w, 0)), res.get((name, kind, w, 1))
            same = a == c; diff += not same
            print(f"| {name} | {'터치' if kind == 'touch' else '마우스·키보드'} | {w} | {a} | {c} | {'같음' if same else '다름'} |")
print(f'\n다른 칸 {diff}개')
