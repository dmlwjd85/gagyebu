#!/usr/bin/env python3
"""반복 자동 기록이 사용자가 고친·지운 같은 달 기록을 덮어쓰거나 되살리는지(QA D1).
사용: 에뮬레이터 + VITE_USE_EMULATOR 미리보기를 띄운 뒤
  python3 tools/qa/rec_overwrite.py [A 주소] [B 주소] [사진 접두사]
  에뮬레이터 주소·포트·프로젝트는 tools/qa/emu.py(QA_EMU_HOST·QA_PROJECT 등, 기본 프로젝트 demo-qa-<pid>) · 환경 변수 CASES(기본 1,2,3)
  A·B 주소를 다르게 주면 기기 B만 다른 빌드(예: 예전 버전 앱)로 돌릴 수 있음.
경우
 ① 예전 형식 반복(lastPosted가 늦음)의 10월 기록을 81,000원으로 고침(새 id로 옮겨짐) → 25일 뒤에 다시 열기 → 81,000원 그대로인지
 ② 기기 B가 오프라인으로 자정을 넘겨 10월 자동 기록을 대기열에 넣음 → 기기 A가 같은 기록을 81,000원으로 고침 → B 연결 → 서버·A 모두 81,000원인지
 ③ ②와 같은데 A가 그 기록을 지움 → B 연결 → 지운 기록이 다시 살아나지 않는지 → A에서 되돌리기 → 1건으로 돌아오는지
"""
import json, os, sys, urllib.request as U
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu  # 에뮬레이터 주소·프로젝트(emu.py 참고)
from playwright.sync_api import sync_playwright

A = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
B = emu.app_url(sys.argv[2]) if len(sys.argv) > 2 else A
SHOT = sys.argv[3] if len(sys.argv) > 3 else '/tmp/gagyebu-recow-'
CASES = os.environ.get('CASES', '1,2,3').split(',')
FS = emu.FS_DOCS
def wipe():
    emu.reset()  # 이 실행의 프로젝트만 지움
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
READY = 'window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0'
R = {'A': A, 'B': B, 'cases': {}}
def rows(uid, ym='2026-10'):
    return sorted((t['_id'], int(t['amount']), t.get('memo'), t.get('origin', '')) for t in docs(f'users/{uid}/transactions') if t.get('recurringId') and t['date'].startswith(ym))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    def open_ctx(url, when, tag, log):
        c = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul'); pg = c.new_page(); pg.clock.set_fixed_time(when)
        pg.on('console', lambda m: log.append(f'{tag} {m.type}: {m.text[:150]}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: log.append(f'{tag} pageerror: {e}'))
        pg.goto(url); pg.wait_for_timeout(1200)
        if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인')
        pg.wait_for_function(READY, timeout=30000); pg.wait_for_timeout(2500)
        pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
        return c, pg
    toast = lambda pg: pg.evaluate("(()=>{const t=document.querySelector('#toast');return t&&t.classList.contains('show')?t.innerText.replace(/\\n/g,' / '):''})()")
    def to_list(pg):
        pg.evaluate("window.__gagyebu.go('calendar')"); pg.wait_for_timeout(400)
        pg.evaluate("window.__gagyebu.ui.viewYm='2026-10'; window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); pg.wait_for_timeout(800)
    def edit(pg, tx_id, amount, memo):
        to_list(pg); pg.click(f'[data-tx="{tx_id}"]'); pg.wait_for_timeout(700)
        for _ in range(10): pg.click('.key[data-key="⌫"]')
        for k in str(amount): pg.click(f'.key[data-key="{k}"]')
        pg.fill('input[name=memo]', memo); pg.click('[data-save]'); pg.wait_for_timeout(3000)
    day_check = lambda pg: pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")

    if '1' in CASES:
        wipe(); log = []
        c, pg = open_ctx(A, '2026-10-19T12:00:00+09:00', 'A', log); uid = pg.evaluate('window.__gagyebu.state.user.uid'); c.close()
        LAG = '5555666677778888'
        put(f'users/{uid}/recurring/{LAG}', {'name': '보험', 'amount': 80000, 'kind': 'expense', 'categoryId': 'housing', 'dayOfMonth': 25, 'active': True, 'startYm': '2026-08', 'lastPosted': '2026-09', 'createdAt': 'TS:2026-08-01T00:00:00Z'})
        put(f'users/{uid}/transactions/rec-{LAG}-2026-10', {'date': '2026-10-25', 'amount': 80000, 'kind': 'expense', 'categoryId': 'housing', 'memo': '보험', 'recurringId': LAG, 'createdAt': 'TS:2026-10-01T00:00:00Z'})
        c, pg = open_ctx(A, '2026-10-19T12:00:00+09:00', 'A', log)
        S = {'0_open': rows(uid)}
        edit(pg, f'rec-{LAG}-2026-10', 81000, '보험 10월 직접 고침')
        S['1_edit'] = rows(uid); S['1_toast'] = toast(pg)
        S['1_lastPosted'] = [(r['_id'], r.get('lastPosted')) for r in docs(f'users/{uid}/recurring')]
        c.close()
        c, pg = open_ctx(A, '2026-10-26T09:00:00+09:00', 'A', log); pg.wait_for_timeout(2500)
        S['2_reopen_26'] = rows(uid); to_list(pg); pg.screenshot(path=f'{SHOT}case1-reopen-360.png'); c.close()
        c, pg = open_ctx(A, '2026-11-26T09:00:00+09:00', 'A', log); pg.wait_for_timeout(2500)
        S['3_nov'] = rows(uid, '2026-11'); S['3_oct'] = rows(uid); c.close()
        S['log'] = log
        S['ok'] = len(S['2_reopen_26']) == 1 and S['2_reopen_26'][0][1:3] == (81000, '보험 10월 직접 고침') and len(S['3_nov']) == 1 and S['3_oct'] == S['2_reopen_26']
        R['cases']['1'] = S

    def two_devices(action):
        wipe(); log = []
        cb, pb = open_ctx(B, '2026-10-24T23:58:50+09:00', 'B', log); uid = pb.evaluate('window.__gagyebu.state.user.uid')
        RID = 'goodRec25'; T = f'rec-{RID}-2026-10'
        put(f'users/{uid}/recurring/{RID}', {'name': '관리비', 'amount': 80000, 'kind': 'expense', 'categoryId': 'housing', 'dayOfMonth': 25, 'active': True, 'startYm': '2026-09', 'lastPosted': '2026-09', 'createdAt': 'TS:2026-09-01T00:00:00Z'})
        pb.wait_for_function('window.__gagyebu.state.recurring.length>0', timeout=20000); pb.wait_for_timeout(1500)
        day_check(pb)  # 오늘 = 10-24 기억
        cb.set_offline(True); pb.wait_for_timeout(500)
        pb.clock.set_fixed_time('2026-10-25T00:00:30+09:00'); day_check(pb); pb.wait_for_timeout(1500)
        S = {'B_local_after_midnight': pb.evaluate("window.__gagyebu.state.txs.filter(t=>t.recurringId).map(t=>[t.id,t.amount,t.memo])"), 'server_before_A': rows(uid)}
        ca, pa = open_ctx(A, '2026-10-25T09:00:00+09:00', 'A', log); pa.wait_for_timeout(2000)
        S['server_after_A_open'] = rows(uid)
        if action == 'edit':
            edit(pa, T, 81000, '관리비 10월 직접 고침'); S['server_after_A_edit'] = rows(uid)
        else:
            pa.evaluate(f"window.__before = window.__gagyebu.state.txs.find(t => t.id === '{T}')")
            to_list(pa); pa.click(f'[data-tx="{T}"]'); pa.wait_for_timeout(600); pa.click('[data-del]'); pa.wait_for_timeout(800)
            if pa.locator('[role=alertdialog] [data-v="1"]').count(): pa.click('[role=alertdialog] [data-v="1"]')
            pa.wait_for_timeout(2500); S['server_after_A_delete'] = rows(uid)
            S['skipped_after_delete'] = [r.get('skipped') for r in docs(f'users/{uid}/recurring')]
        cb.set_offline(False); pb.wait_for_timeout(9000)
        S['B_toast_after_online'] = toast(pb)
        S['server_after_B_online'] = rows(uid)
        pa.wait_for_timeout(1500)
        S['A_view'] = pa.evaluate(f"(window.__gagyebu.state.txs.find(t=>t.id==='{T}')||{{}}).amount ?? null")
        S['B_view'] = pb.evaluate(f"(window.__gagyebu.state.txs.find(t=>t.id==='{T}')||{{}}).amount ?? null")
        to_list(pa); pa.screenshot(path=f'{SHOT}case-{action}-A-after-B-online-360.png')
        if action == 'delete':
            pa.evaluate("window.__gagyebu.data.restoreTx(window.__before)"); pa.wait_for_timeout(3000)
            S['after_A_undo'] = rows(uid); S['skipped_after_undo'] = [r.get('skipped') for r in docs(f'users/{uid}/recurring')]
            ca.close(); cb.close()
            c2, p2 = open_ctx(A, '2026-10-26T09:00:00+09:00', 'A', log); p2.wait_for_timeout(2000); S['reopen_26'] = rows(uid); c2.close()
        else:
            ca.close(); cb.close()
        S['log'] = log
        return S
    if '2' in CASES:
        S = two_devices('edit')
        S['ok'] = S['server_after_B_online'] == S['server_after_A_edit'] and len(S['server_after_B_online']) == 1 and S['server_after_B_online'][0][1] == 81000 and S['A_view'] == 81000 and S['B_view'] == 81000
        R['cases']['2'] = S
    if '3' in CASES:
        S = two_devices('delete')
        S['ok'] = S['server_after_A_delete'] == [] and S['server_after_B_online'] == [] and S['A_view'] is None and S['B_view'] is None \
            and len(S.get('after_A_undo', [])) == 1 and S.get('reopen_26') == S.get('after_A_undo')
        R['cases']['3'] = S
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
ok = all(v['ok'] for v in R['cases'].values())
print('경우별:', {k: ('통과' if v['ok'] else '실패') for k, v in R['cases'].items()})
print('결과:', '통과' if ok else '실패')
sys.exit(0 if ok else 1)
