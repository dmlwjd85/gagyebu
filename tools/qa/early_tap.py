"""컵을 누른 '직후' 입력 검사(QA 4차 D1·D2 재현·회귀 방지). 사람이 외워 둔 자리를 시간 맞춰 누르듯, 시트가 다 열렸을 때의 자판 자리를
미리 재 두고 컵을 누른 뒤 정확히 0·50·…·400ms 에 그 자리(자판 '1', 이어서 150ms 뒤 '2')를 누름. 실제 누른 시각(컵 pointerdown → 첫 pointerdown)을 함께 기록.
홈에 기록 2건을 넣어 둔 상태(시트가 안 열려 있으면 '1' 자리에 홈 카드가 있음). 폭 320/339/360/390/1280 × 마우스·터치 × 기본·움직임 줄이기.
더해: 키보드(컵에서 Enter → 150·200ms 에 1·2), 320 '8 8', 339 '0 0', 360/390 금액 '5 0' 뒤 바로 '저장'.
결과는 JSON 줄로 저장 → main 과 이 PR 을 따로 돌린 뒤 --compare 로 나란히 비교(두 실행은 서로 다른 --project 로: emu.reset 이 지움).
사용: python3 tools/qa/early_tap.py 앱주소 결과.jsonl [--emu-host=… --auth-port=… --fs-port=… --project=demo-…]
      python3 tools/qa/early_tap.py --compare main.jsonl pr.jsonl"""
import os, sys, json
if sys.argv[1] == '--compare':
    A = {r['id']: r for r in map(json.loads, open(sys.argv[2]))}; B = {r['id']: r for r in map(json.loads, open(sys.argv[3]))}
    diff = 0
    for k, a in A.items():
        b = B.get(k); same = b and all(a.get(x) == b.get(x) for x in ('amount', 'open', 'hash', 'err', 'toast', 'keys'))
        diff += not same
        f = lambda r: f"{r['amount'] or '-'}/{'열림' if r['open'] else '닫힘'}{' ' + r['hash'] if r['hash'] else ''}{' 오류' if r['err'] else ''}{' 토스트' if r['toast'] else ''}{' 키:' + r['keys'] if r.get('keys') else ''} ({r['t']})" if r else '없음'
        print(f"{k:<34} main {f(a):<34} PR {f(b):<34} {'같음' if same else '다름'}")
    print(f'\n{len(A)}건 중 다름 {diff}건'); sys.exit(1 if diff else 0)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu
from playwright.sync_api import sync_playwright
URL = emu.app_url(sys.argv[1]); OUT = open(sys.argv[2], 'w')
emu.reset()
WIDTHS = [(320, 640), (339, 700), (360, 780), (390, 844), (1280, 800)]
DELAYS = [0, 50, 100, 150, 200, 250, 300, 350, 400]
INIT = "window.__pd = []; addEventListener('pointerdown', (e) => __pd.push(e.timeStamp), true); window.__kd = []; addEventListener('keydown', (e) => __kd.push(e.timeStamp), true); window.__keys = []; addEventListener('click', (e) => { const k = e.target.closest?.('#sheet-root [data-key]'); if (k) __keys.push(k.dataset.key); })"
WATCH = """() => { const W = window.__w = { toast: 0 }; new MutationObserver((ms) => { for (const m of ms) { if (m.target.id === 'toast' && m.target.classList.contains('show')) W.toast++;
  for (const a of m.addedNodes || []) if (a.id === 'toast') W.toast++; } }).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }); }"""
STATE = """() => { const sr = document.getElementById('sheet-root'); return { open: sr.classList.contains('open'), hash: location.hash.replace(/^#\\/?(home)?$/, ''),
  amount: (sr.querySelector('.amount-display')?.getAttribute('aria-label') || '').replace(/[^0-9,]/g, '') , toast: window.__w.toast,
  err: /입력해 주세요|선택해 주세요/.test(sr.querySelector('.sheet')?.innerText || '') }; }"""
FAB = """() => { const f = [...document.querySelectorAll('.fab, .desk-fab')].find((e) => e.getClientRects().length); const r = f.getBoundingClientRect();
  const d = f.querySelector('.fab-disc').getBoundingClientRect(); return [r.x + r.width / 2, d.y + d.height / 2]; }"""
POS = """() => { const o = {}; for (const e of document.querySelectorAll('#sheet-root [data-key], #sheet-root [data-save]')) { const r = e.getBoundingClientRect();
  o[e.dataset.key ?? 'save'] = [r.x + r.width / 2, r.y + r.height / 2]; } return o; }"""

def login(pg):
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.reload(); pg.wait_for_timeout(1500)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(3000)
    if pg.locator('text=나중에 고를게요').count(): pg.click('text=나중에 고를게요'); pg.wait_for_timeout(2500)

def seed(pg, amounts):  # 홈에 기록 넣기(보통 사용 길: 컵 → 숫자 → 첫 분류 → 저장). 금액은 실행 안에서 겹치지 않게(같은 금액이면 '중복인가요?')
    for a in amounts:
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.locator(':is(.fab, .desk-fab):visible').first.click(); pg.wait_for_timeout(900)
        for k in a: pg.locator(f'#sheet-root [data-key="{k}"]').click(); pg.wait_for_timeout(60)
        pg.locator('#sheet-root .cat-chip').first.click(); pg.wait_for_timeout(150); pg.locator('#sheet-root [data-save]').click(); pg.wait_for_timeout(700)
        if pg.locator('text=그래도 저장').count(): pg.click('text=그래도 저장'); pg.wait_for_timeout(700)

def tap(pg, kind, x, y):
    if kind == 'touch': pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)

def run_case(pg, kind, steps, key=False):
    """steps: [(컵 기준 ms, (x,y) 또는 키 이름)]. 첫 단계(0)는 컵. 정해진 시각까지 기다렸다 누름"""
    pg.evaluate(WATCH); pg.evaluate("__pd.length = 0; __kd.length = 0; __keys.length = 0")
    t0 = None
    for ms, what in steps:
        if t0 is not None:
            left = ms - (pg.evaluate('performance.now()') - t0)
            if left > 1: pg.wait_for_timeout(left)
        if t0 is None: t0 = pg.evaluate('performance.now()')
        if isinstance(what, str): pg.keyboard.press(what)
        else: tap(pg, kind, *what)
    pg.wait_for_timeout(900)
    ts = pg.evaluate('__kd' if key else '__pd'); r = pg.evaluate(STATE); r['keys'] = ' '.join(pg.evaluate('__keys'))  # 자판이 실제로 받은 키('0 0' 은 금액만으론 0원이라 구분 안 됨)
    r['t'] = '·'.join(str(round(b - ts[0])) for b in ts[1:]) + 'ms'  # 컵 누름 기준 실제 누른 시각
    return r

with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    for reduced in (False, True):
      for kind in ('mouse', 'touch'):
        for w, h in WIDTHS:
            if os.environ.get('ONLY') and str(w) not in os.environ['ONLY'].split(','): continue  # 예: ONLY=339
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, locale='ko-KR', has_touch=kind == 'touch', is_mobile=kind == 'touch' and w < 1024,
                                reduced_motion='reduce' if reduced else 'no-preference')
            ctx.add_init_script(INIT)
            lp = ctx.new_page(); login(lp)
            n = len(open(sys.argv[2]).readlines()); seed(lp, [f'{w}{n}1', f'{w}{n}2'])  # 컨텍스트(로그인)마다 기록 2건
            lp.goto(URL); lp.wait_for_timeout(1500); fx = lp.evaluate(FAB)
            lp.locator(':is(.fab, .desk-fab):visible').first.click(); lp.wait_for_timeout(1200); pos = lp.evaluate(POS); lp.close()
            M = ('줄임' if reduced else '기본'); T = '터치' if kind == 'touch' else '마우스'
            def case(cid, steps, key=False):
                pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(1500)
                if key: pg.evaluate("[...document.querySelectorAll('.fab, .desk-fab')].find((e) => e.getClientRects().length).focus()")
                r = run_case(pg, kind, steps, key); r['id'] = f'{w} {T} {M} {cid}'; OUT.write(json.dumps(r, ensure_ascii=False) + '\n'); OUT.flush(); pg.close()
            for d in DELAYS: case(f'컵→{d}ms 1·2', [(0, fx), (d, pos['1']), (d + 150, pos['2'])])
            if kind == 'mouse': case('Enter→150·200ms 1·2', [(0, 'Enter'), (150, '1'), (200, '2')], key=True)
            if w == 320: case("8 8(300·600ms)", [(0, fx), (300, pos['8']), (600, pos['8'])]); case("8 8(150·300ms)", [(0, fx), (150, pos['8']), (300, pos['8'])])
            if w == 339: case("0 0(300·600ms)", [(0, fx), (300, pos['0']), (600, pos['0'])]); case("0 0(150·300ms)", [(0, fx), (150, pos['0']), (300, pos['0'])])
            if w in (360, 390): case('5 0 → 저장(250·400·550ms)', [(0, fx), (250, pos['5']), (400, pos['0']), (550, pos['save'])])
            print(w, T, M, 'fab', [round(v) for v in fx], '1', [round(v) for v in pos['1']], '8', [round(v) for v in pos['8']], '0', [round(v) for v in pos['0']], 'save', [round(v) for v in pos['save']], flush=True)
            ctx.close()
    b.close()
