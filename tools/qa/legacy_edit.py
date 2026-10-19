#!/usr/bin/env python3
"""예전 형식 id 문서 고치기(QA N6): 늘 같은 새 id로 옮겨 저장되는지, 같은 달 자동 기록과 겹쳐 2건이 되지 않는지.
사용: 에뮬레이터(auth 9099·firestore 8080) + VITE_USE_EMULATOR 미리보기 띄운 뒤
  python3 tools/qa/legacy_edit.py [URL] [사진 접두사]
준비(관리자 권한으로 직접 씀): 형식 밖 반복 BAD(lastPosted 10월)와 rec-BAD-2026-10, 형식 밖 반복 BAD2(lastPosted 9월, 예전 앱이 남긴 어긋난 상태)와
  rec-BAD2-2026-10, 형식 밖 일반 거래 LEG.
"""
import json, sys, urllib.request as U
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/gagyebu-legacy-'
PROJ = 'demo-gagyebu'
FS = f'http://127.0.0.1:8080/v1/projects/{PROJ}/databases/(default)/documents'
for u in [f'http://127.0.0.1:8080/emulator/v1/projects/{PROJ}/databases/(default)/documents', f'http://127.0.0.1:9099/emulator/v1/projects/{PROJ}/accounts']:
    U.urlopen(U.Request(u, method='DELETE'))
def F(v):
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, str) and v.startswith('TS:'): return {'timestampValue': v[3:]}
    return {'stringValue': v}
def put(path, fields):
    U.urlopen(U.Request(f'{FS}/{path}', data=json.dumps({'fields': {k: F(v) for k, v in fields.items()}}).encode(), method='PATCH', headers={'Authorization': 'Bearer owner', 'Content-Type': 'application/json'}))
def docs(path):
    j = json.load(U.urlopen(U.Request(f'{FS}/{path}?pageSize=300', headers={'Authorization': 'Bearer owner'})))
    out = []
    for d in j.get('documents', []):
        o = {k: list(v.values())[0] for k, v in d['fields'].items()}; o['_id'] = d['name'].split('/')[-1]; out.append(o)
    return out
BAD, BAD2, LEG = 'q1w2e3r4t5y6u7i8o9p0a1s2d3', 'z9x8c7v6b5n4m3a2s1d0f9g8h7', 'legacyTx1234567890123'
READY = 'window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0'
R, errs, cons = {'steps': {}}, [], []
def rows(uid, amount=None):
    return sorted((t['_id'], t['date'], int(t['amount']), t.get('memo'), t.get('recurringId', '')) for t in docs(f'users/{uid}/transactions') if amount is None or int(t['amount']) == amount)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    def open_ctx(when):
        c = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul'); pg = c.new_page(); pg.clock.set_fixed_time(when)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' else None)
        pg.goto(URL); pg.wait_for_timeout(1200); pg.click('text=테스트 계정으로 로그인'); pg.wait_for_function(READY, timeout=20000); pg.wait_for_timeout(3000)
        pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
        return c, pg
    toast = lambda pg: pg.evaluate("(()=>{const t=document.querySelector('#toast');return t&&t.classList.contains('show')?t.innerText.replace(/\\n/g,' / '):''})()")
    def to_list(pg):
        pg.evaluate("window.__gagyebu.go('calendar')"); pg.wait_for_timeout(400)
        pg.evaluate("window.__gagyebu.ui.viewYm='2026-10'; window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); pg.wait_for_timeout(700)
    def edit_memo(pg, tx_id, memo):
        to_list(pg); pg.click(f'[data-tx="{tx_id}"]'); pg.wait_for_timeout(600)
        pg.fill('input[name=memo]', memo); pg.click('[data-save]'); pg.wait_for_timeout(400)
        t = toast(pg); pg.wait_for_timeout(2000); return t
    c, pg = open_ctx('2026-10-19T12:00:00+09:00'); uid = pg.evaluate('window.__gagyebu.state.user.uid'); c.close()
    for rid, name, amt, lp in [(BAD, '관리비', 120000, '2026-10'), (BAD2, '보험', 33000, '2026-09')]:
        put(f'users/{uid}/recurring/{rid}', {'name': name, 'amount': amt, 'kind': 'expense', 'categoryId': 'housing', 'dayOfMonth': 1, 'active': True, 'startYm': '2026-09', 'lastPosted': lp, 'createdAt': 'TS:2026-09-01T00:00:00Z'})
        put(f'users/{uid}/transactions/rec-{rid}-2026-10', {'date': '2026-10-01', 'amount': amt, 'kind': 'expense', 'categoryId': 'housing', 'memo': name, 'recurringId': rid, 'createdAt': 'TS:2026-10-01T00:00:00Z'})
    put(f'users/{uid}/transactions/{LEG}', {'date': '2026-10-05', 'amount': 3000, 'kind': 'expense', 'categoryId': 'food', 'memo': '편의점', 'createdAt': 'TS:2026-10-05T00:00:00Z'})

    c, pg = open_ctx('2026-10-19T12:00:00+09:00')
    R['steps']['0_open'] = {'rows': rows(uid), 'recurring': sorted((r['_id'], r.get('lastPosted'), 'createdAt' in r) for r in docs(f'users/{uid}/recurring'))}
    rx = [r['_id'] for r in docs(f'users/{uid}/recurring') if r.get('name') == '관리비'][0]
    rx2 = [r['_id'] for r in docs(f'users/{uid}/recurring') if r.get('name') == '보험'][0]
    # a) 형식 밖 rec- 문서 메모 고치기
    t = edit_memo(pg, f'rec-{BAD}-2026-10', '관리비 10월')
    R['steps']['a_edit'] = {'toast': t, 'rows': rows(uid, 120000)}
    pg.screenshot(path=f'{SHOT}legacy-edit-saved-360.png')
    # b) 되돌리기 → 옮긴 문서가 예전 내용으로(새 문서 안 생김)
    to_list(pg); pg.click(f'[data-tx="rec-{rx}-2026-10"]'); pg.wait_for_timeout(600)
    pg.fill('input[name=memo]', '관리비 10월 두 번째'); pg.click('[data-save]'); pg.wait_for_timeout(500)
    if pg.locator('#toast.show .toast-btn:has-text("되돌리기")').count(): pg.click('#toast.show .toast-btn'); pg.wait_for_timeout(2000)
    R['steps']['b_undo'] = {'toast': toast(pg), 'rows': rows(uid, 120000)}
    # c) 어긋난 상태(BAD2: 9월까지만 기록했다고 적혀 있는데 10월 문서가 있음)의 예전 문서 고치기 → 자동 기록된 10월과 하나로 모임
    R['steps']['c_before'] = rows(uid, 33000)
    t = edit_memo(pg, f'rec-{BAD2}-2026-10', '보험 10월')
    R['steps']['c_edit'] = {'toast': t, 'rows': rows(uid, 33000)}
    # d) 형식 밖 일반 거래 고치기 → tx… 고정 id로, 지우고 되돌리기도 같은 id
    t = edit_memo(pg, LEG, '편의점 우유')
    R['steps']['d_edit'] = {'toast': t, 'rows': rows(uid, 3000)}
    moved = rows(uid, 3000)[0][0]
    to_list(pg); pg.click(f'[data-tx="{moved}"]'); pg.wait_for_timeout(600); pg.click('[data-del]'); pg.wait_for_timeout(800)
    if pg.locator('[role=alertdialog] [data-v="1"]').count(): pg.click('[role=alertdialog] [data-v="1"]'); pg.wait_for_timeout(600)
    pg.click('#toast.show .toast-btn'); pg.wait_for_timeout(2000)
    R['steps']['d_del_undo'] = {'toast': toast(pg), 'rows': rows(uid, 3000)}
    c.close()
    # e) 같은 날 다시 열기·다음 날 열기: 10월이 다시 기록되지 않음
    for when in ['2026-10-19T20:00:00+09:00', '2026-10-20T09:00:00+09:00']:
        c, pg = open_ctx(when); c.close()
    R['steps']['e_reopen'] = {'120000': rows(uid, 120000), '33000': rows(uid, 33000)}
    # f) 다음 달: 11월만 새로 기록
    c, pg = open_ctx('2026-11-02T09:00:00+09:00')
    R['steps']['f_nov'] = {'120000': rows(uid, 120000), '33000': rows(uid, 33000), 'lastPosted': sorted((r['_id'], r.get('lastPosted')) for r in docs(f'users/{uid}/recurring'))}
    pg.screenshot(path=f'{SHOT}legacy-nov-360.png'); c.close()
    b.close()
R['page_errors'] = errs; R['console_errors'] = cons
print(json.dumps(R, ensure_ascii=False, indent=1))
S = R['steps']
ids = lambda rs: [r[0] for r in rs]
ok = (ids(S['a_edit']['rows']) == [f'rec-{rx}-2026-10'] and S['a_edit']['rows'][0][3] == '관리비 10월' and S['a_edit']['rows'][0][4] == rx
      and '고쳤어요' in S['a_edit']['toast'] and '새로 고친' not in S['a_edit']['toast']
      and ids(S['b_undo']['rows']) == [f'rec-{rx}-2026-10'] and S['b_undo']['rows'][0][3] == '관리비 10월'
      and ids(S['c_edit']['rows']) == [f'rec-{rx2}-2026-10'] and S['c_edit']['rows'][0][3] == '보험 10월'
      and len(S['d_edit']['rows']) == 1 and S['d_edit']['rows'][0][0].startswith('tx') and S['d_edit']['rows'][0][3] == '편의점 우유'
      and ids(S['d_del_undo']['rows']) == ids(S['d_edit']['rows'])
      and ids(S['e_reopen']['120000']) == [f'rec-{rx}-2026-10'] and ids(S['e_reopen']['33000']) == [f'rec-{rx2}-2026-10']
      and ids(S['f_nov']['120000']) == [f'rec-{rx}-2026-10', f'rec-{rx}-2026-11'] and ids(S['f_nov']['33000']) == [f'rec-{rx2}-2026-10', f'rec-{rx2}-2026-11']
      and not errs and not [x for x in cons if 'permission' in x.lower()])
print('결과:', '통과' if ok else '실패')
sys.exit(0 if ok else 1)
