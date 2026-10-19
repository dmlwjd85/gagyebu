#!/usr/bin/env python3
"""되돌리기가 끝내 저장되지 못할 때 이 기기 보관함으로 지키는지 확인(QA 5차 R5).
사용: 에뮬레이터(auth 9099·firestore 8080) + VITE_USE_EMULATOR 미리보기 띄운 뒤
  python3 tools/qa/restore_keep.py [URL] [사진 접두사]
  사진 접두사 기본값 /tmp/gagyebu-keep-
확인: 보관 안내 토스트 → 설정 › 데이터에 '보관된 기록' 줄 → 새로 고침 뒤에도 남음 → CSV 받기 → 다시 저장(성공하면 줄이 사라짐)
"""
import json, sys, urllib.request as U
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/gagyebu-keep-'
PROJ = 'demo-gagyebu'
FS = f'http://127.0.0.1:8080/v1/projects/{PROJ}/databases/(default)/documents'
for u in [f'http://127.0.0.1:8080/emulator/v1/projects/{PROJ}/databases/(default)/documents', f'http://127.0.0.1:9099/emulator/v1/projects/{PROJ}/accounts']:
    U.urlopen(U.Request(u, method='DELETE'))

def tx_docs(uid):
    j = json.load(U.urlopen(U.Request(f'{FS}/users/{uid}/transactions?pageSize=300', headers={'Authorization': 'Bearer owner'})))
    return [d['fields'].get('memo', {}).get('stringValue') for d in j.get('documents', [])]

R, errs = {}, []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    ctx = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul', accept_downloads=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.click('text=테스트 계정으로 로그인')
    pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0', timeout=20000)
    pg.wait_for_timeout(1500)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    uid = pg.evaluate('window.__gagyebu.state.user.uid')
    toast = lambda: pg.evaluate("(()=>{const t=document.querySelector('#toast');return t&&t.classList.contains('show')?t.innerText.replace(/\\n/g,' / '):''})()")
    # 규칙이 어떤 형태로도 받지 않는 기록(없는 날짜)을 되돌리기 → 세 단계 모두 거부 → 보관
    R['restored'] = pg.evaluate("""() => window.__gagyebu.data.restoreTx({ id: 'keepTest1', date: '2026-02-30', amount: 4500, kind: 'expense', categoryId: 'food', memo: '보관 시험 김밥' })""")
    pg.wait_for_timeout(500)
    R['toast'] = toast()
    R['kept_ls'] = pg.evaluate(f"JSON.parse(localStorage.getItem('keptTx:{uid}')||'[]').length")
    pg.evaluate("window.__gagyebu.go('settings')"); pg.wait_for_timeout(700)
    R['row'] = pg.locator('#s-kept').inner_text() if pg.locator('#s-kept').count() else ''
    pg.locator('#s-kept').scroll_into_view_if_needed()
    pg.screenshot(path=f'{SHOT}keep-settings-360.png', full_page=True)
    # 새로 고침 뒤에도 남는지
    pg.reload(); pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0', timeout=20000); pg.wait_for_timeout(2500)
    pg.evaluate("window.__gagyebu.go('settings')"); pg.wait_for_timeout(700)
    R['row_after_reload'] = pg.locator('#s-kept').count()
    with pg.expect_download() as d:
        pg.click('[data-action="kept-csv"]')
    path = d.value.path(); R['csv_name'] = d.value.suggested_filename
    R['csv_has_row'] = '보관 시험 김밥' in open(path, encoding='utf-8-sig').read()
    pg.click('[data-action="kept-retry"]'); pg.wait_for_timeout(1500)
    R['retry_fail_toast'] = toast()
    # 날짜를 고쳐 두면(실제로는 규칙·앱이 바뀐 경우) 다시 저장되고 줄이 사라지는지
    pg.evaluate(f"(()=>{{const k='keptTx:{uid}';const l=JSON.parse(localStorage.getItem(k));l[0].date='2026-02-28';localStorage.setItem(k,JSON.stringify(l));}})()")
    pg.click('[data-action="kept-retry"]'); pg.wait_for_timeout(2000)
    R['retry_ok_toast'] = toast()
    R['row_after_ok'] = pg.locator('#s-kept').count()
    R['server_has'] = '보관 시험 김밥' in tx_docs(uid)
    R['kept_ls_after'] = pg.evaluate(f"localStorage.getItem('keptTx:{uid}')")
    R['page_errors'] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
ok = (R['restored'] is False and R['kept_ls'] == 1 and '보관' in R['toast'] and R['row'] and R['row_after_reload'] == 1 and R['csv_has_row']
      and '아직 저장하지 못했어요' in R['retry_fail_toast'] and R['row_after_ok'] == 0 and R['server_has'] and R['kept_ls_after'] is None and not errs)
print('결과:', '통과' if ok else '실패')
sys.exit(0 if ok else 1)
