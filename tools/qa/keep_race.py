#!/usr/bin/env python3
"""보관함 다시 저장이 겹쳐도 1건만 생기는지 확인(QA N1).
사용: 에뮬레이터(auth 9099·firestore 8080) + VITE_USE_EMULATOR 미리보기 띄운 뒤
  python3 tools/qa/keep_race.py [URL] [사진 접두사]
경우: ① [다시 저장하기] 더블클릭·5번 연타 ② 두 탭에서 동시에 누르기 ③ 잠금을 거치지 않고 두 탭이 3번씩 동시에 저장(고정 id만으로 1건인지)
     ④ 앱을 다시 열 때 자동 재저장과 버튼이 겹침 ⑤ 같은 id로 살릴 수 있는 기록(1단계)도 두 탭 동시
각 경우마다 원래 id는 규칙이 받지 않는 형식(숫자 13개)이라 새 id 단계로 가게 하고, 서버 문서 수를 셈.
"""
import json, sys, urllib.request as U
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/gagyebu-race-'
PROJ = 'demo-gagyebu'
FS = f'http://127.0.0.1:8080/v1/projects/{PROJ}/databases/(default)/documents'
for u in [f'http://127.0.0.1:8080/emulator/v1/projects/{PROJ}/databases/(default)/documents', f'http://127.0.0.1:9099/emulator/v1/projects/{PROJ}/accounts']:
    U.urlopen(U.Request(u, method='DELETE'))

def docs_with(uid, memo):
    j = json.load(U.urlopen(U.Request(f'{FS}/users/{uid}/transactions?pageSize=300', headers={'Authorization': 'Bearer owner'})))
    return [d['name'].split('/')[-1] for d in j.get('documents', []) if d['fields'].get('memo', {}).get('stringValue') == memo]

READY = 'window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0'
R, errs = {}, []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    ctx = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul')
    A = ctx.new_page(); A.on('pageerror', lambda e: errs.append(str(e)))
    A.goto(URL); A.wait_for_timeout(1200); A.click('text=테스트 계정으로 로그인'); A.wait_for_function(READY, timeout=20000); A.wait_for_timeout(1500)
    A.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    uid = A.evaluate('window.__gagyebu.state.user.uid'); KEY = f'keptTx:{uid}'
    Bp = ctx.new_page(); Bp.on('pageerror', lambda e: errs.append(str(e)))
    Bp.goto(URL); Bp.wait_for_function(READY, timeout=20000); Bp.wait_for_timeout(1500)

    def make_kept(memo, tx_id='k1234567890123x'):
        """세 단계 모두 거부되는 기록(없는 날짜)을 보관 → 날짜를 고쳐 다시 저장되게 해 둠"""
        r = A.evaluate(f"() => window.__gagyebu.data.restoreTx({{ id: '{tx_id}', date: '2026-02-30', amount: 4500, kind: 'expense', categoryId: 'food', memo: '{memo}' }}, {{ quiet: true }})")
        A.evaluate(f"(()=>{{const l=JSON.parse(localStorage.getItem('{KEY}'));for(const x of l) if(x.memo==='{memo}') x.date='2026-02-28';localStorage.setItem('{KEY}',JSON.stringify(l));}})()")
        item = A.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).find(x=>x.memo==='{memo}')")
        return r, item
    def settings(pg):
        pg.evaluate("window.__gagyebu.go('settings')"); pg.wait_for_timeout(700)
    def left():
        return A.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')||'[]').length")

    # ① 더블클릭·연타
    r, item = make_kept('겹침1 더블클릭')
    R['keepId'] = item.get('keepId'); R['kept_restored'] = r
    settings(A); A.wait_for_selector('[data-action="kept-retry"]')
    A.dblclick('[data-action="kept-retry"]')
    R['busy_label'] = A.locator('[data-action="kept-retry"]').inner_text() if A.locator('[data-action="kept-retry"]').count() else '(줄 사라짐)'
    A.wait_for_timeout(2500)
    R['1_dblclick'] = docs_with(uid, '겹침1 더블클릭')
    r, item = make_kept('겹침1 연타')
    settings(A)
    A.evaluate("(()=>{const b=document.querySelector('[data-action=\"kept-retry\"]');for(let i=0;i<5;i++) b.click();})()")
    A.wait_for_timeout(2500)
    R['1_click5'] = docs_with(uid, '겹침1 연타')

    # ② 두 탭 동시에 버튼
    r, item = make_kept('겹침2 두 탭')
    settings(A); settings(Bp)
    for pg in (A, Bp): pg.evaluate("window.__gagyebu.render && window.__gagyebu.render()")
    Bp.wait_for_selector('[data-action="kept-retry"]', timeout=5000)
    A.evaluate("setTimeout(()=>document.querySelector('[data-action=\"kept-retry\"]').click(), 300)")
    Bp.evaluate("setTimeout(()=>document.querySelector('[data-action=\"kept-retry\"]').click(), 300)")
    A.wait_for_timeout(3000)
    R['2_two_tabs'] = docs_with(uid, '겹침2 두 탭')

    # ③ 잠금 없이 두 탭이 3번씩 동시에(고정 id만으로)
    r, item = make_kept('겹침3 잠금 없이')
    js = "(it) => Promise.all([0,1,2].map(() => window.__gagyebu.data.restoreTx(it, { fromKeep: true, quiet: true })))"
    A.evaluate(f"(it) => {{ window.__p = ({js})(it); }}", item); Bp.evaluate(f"(it) => {{ window.__p = ({js})(it); }}", item)
    R['3_results'] = [A.evaluate('window.__p'), Bp.evaluate('window.__p')]
    A.wait_for_timeout(1500)
    R['3_no_lock'] = docs_with(uid, '겹침3 잠금 없이')
    R['3_expected_id'] = item['keepId']

    # ④ 다시 열 때 자동 재저장 + 바로 버튼
    r, item = make_kept('겹침4 시작과 겹침')
    Bp.close()
    A.reload(); A.wait_for_function(READY, timeout=20000)
    A.evaluate("window.__gagyebu.go('settings')")
    try:
        A.wait_for_selector('[data-action="kept-retry"]:not([disabled])', timeout=3000); A.click('[data-action="kept-retry"]')
        R['4_clicked'] = True
    except Exception:
        R['4_clicked'] = '자동 재저장이 먼저 끝나 버튼이 없었음'
    A.wait_for_timeout(3000)
    R['4_startup'] = docs_with(uid, '겹침4 시작과 겹침')

    # ⑤ 같은 id로 살릴 수 있는 기록, 두 탭 동시
    Bp = ctx.new_page(); Bp.on('pageerror', lambda e: errs.append(str(e))); Bp.goto(URL); Bp.wait_for_function(READY, timeout=20000); Bp.wait_for_timeout(1500)
    r, item = make_kept('겹침5 같은 id', tx_id='keepSameIdOk')
    settings(A); settings(Bp); Bp.wait_for_selector('[data-action="kept-retry"]', timeout=5000)
    A.evaluate("setTimeout(()=>document.querySelector('[data-action=\"kept-retry\"]').click(), 200)")
    Bp.evaluate("setTimeout(()=>document.querySelector('[data-action=\"kept-retry\"]').click(), 200)")
    A.wait_for_timeout(3000)
    R['5_same_id'] = docs_with(uid, '겹침5 같은 id')
    settings(A); A.screenshot(path=f'{SHOT}keep-race-done-360.png', full_page=True)
    R['left_in_box'] = left()
    R['page_errors'] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
one = lambda k: len(R[k]) == 1
ok = (all(one(k) for k in ['1_dblclick', '1_click5', '2_two_tabs', '3_no_lock', '4_startup', '5_same_id'])
      and R['3_no_lock'] == [R['3_expected_id']] and R['5_same_id'] == ['keepSameIdOk'] and R['left_in_box'] == 0 and not errs)
print('결과:', '통과' if ok else '실패')
sys.exit(0 if ok else 1)
