#!/usr/bin/env python3
"""예전 앱(지금 배포본 640ff0f) + 이 브랜치 규칙에서 생기는 일(QA 3차 한계 ①②③). 롤아웃 안내 문구의 근거.
사용: QA_PROJECT=<두 빌드가 같이 쓰는 프로젝트> python3 tools/qa/old_limits.py 예전앱주소 새앱주소
  (두 빌드의 VITE_FIREBASE_PROJECT_ID를 같게 빌드해야 같은 데이터를 봄)
L2 한 반복의 그 달 기록이 이미 있으면 예전 앱은 다른 반복(넷플릭스)까지 못 남기고, 열 때마다 오류 토스트 → 새 앱을 열면 회복
L1 예전 앱에서 자동 기록을 지움(skipped에 안 남음) → 새 앱을 다시 열어도 같은 달은 lastPosted가 지나 있어 다시 안 생김
L3 예전 앱에서 반복을 저장하면 skipped가 지워짐"""
import json, sys
from rec_lib import emu, sync_playwright, put, docs, recs, rows, open_ctx, toasts, delete_tx, REC, TX, new_user
OLD, NEW = emu.app_url(sys.argv[1]), emu.app_url(sys.argv[2]); R = {}; T = '2026-10-26T09:00:00+09:00'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    # L2
    uid, log = new_user(b, NEW, T)
    put(f'users/{uid}/recurring/bRec1', REC(lastPosted='2026-09'))
    put(f'users/{uid}/transactions/rec-bRec1-2026-10', TX('bRec1', '2026-10', 81000, '관리비 고침'))
    put(f'users/{uid}/recurring/bRec2', REC(name='넷플릭스', amount=13500, categoryId='etc', dayOfMonth=5, lastPosted='2026-09'))
    for i in (1, 2):
        c, pg = open_ctx(b, OLD, T, 'OLD', log); pg.wait_for_timeout(3000)
        R[f'L2 예전 앱 {i}번째 열기'] = {'기록': rows(uid), '반복': recs(uid), '토스트': toasts(pg)}; c.close()
    c, pg = open_ctx(b, NEW, T, 'NEW', log); pg.wait_for_timeout(3000)
    R['L2 새 앱 열기'] = {'기록': rows(uid), '반복': recs(uid), '토스트': toasts(pg)}; c.close()
    # L1
    uid, log = new_user(b, NEW, T)
    put(f'users/{uid}/recurring/aRec1', REC(lastPosted='2026-09'))
    c, pg = open_ctx(b, NEW, T, 'NEW', log); pg.wait_for_timeout(2500); c.close()
    R['L1 새 앱이 남긴 기록'] = {'기록': rows(uid), '반복': recs(uid)}; print(R, flush=True)
    c, pg = open_ctx(b, OLD, T, 'OLD', log); delete_tx(pg, 'rec-aRec1-2026-10'); c.close()
    R['L1 예전 앱에서 지운 뒤'] = {'기록': rows(uid), '반복': recs(uid)}
    for when in (T, '2026-11-26T09:00:00+09:00'):
        c, pg = open_ctx(b, NEW, when, 'NEW', log); pg.wait_for_timeout(2500); c.close()
        R[f'L1 새 앱 다시 열기 {when[:10]}'] = {'기록': rows(uid), '반복': recs(uid)}
    # L3
    uid, log = new_user(b, NEW, T)
    put(f'users/{uid}/recurring/cRec1', REC(lastPosted='2026-10', skipped=['2026-09']))
    c, pg = open_ctx(b, OLD, T, 'OLD', log); pg.wait_for_timeout(1500)
    pg.evaluate("(()=>{const r=window.__gagyebu.state.recurring.find(x=>x.id==='cRec1'); window.__gagyebu.data.saveRecurring({...r, name:'관리비2'})})()"); pg.wait_for_timeout(2500)
    R['L3 예전 앱에서 반복 저장 뒤'] = {'반복': recs(uid), '토스트': toasts(pg)}; c.close(); b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
