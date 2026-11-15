#!/usr/bin/env python3
"""두 기기(하나는 오프라인) 반복 자동 기록 검사(QA 3차 N2·N4).
사용: 에뮬레이터 + VITE_USE_EMULATOR 미리보기를 띄운 뒤
  python3 tools/qa/multi_device.py [A 주소] [B 주소(기본 A와 같음)]   · 환경 변수 CASES(기본 S,N,K)
경우
 S) B 오프라인: 9월 자동 기록을 지움 → B가 자정을 넘김(10월 자동 기록 대기열) → A 온라인: 10월 기록을 지움 → B 연결
    → 서버에 관리비 기록이 하나도 없고(지운 10월이 되살아나지 않음), 지운 달은 09·10 둘 다 남아야 함
 N) A 오프라인: 10월 자동 기록을 지움 → 그 사이 다른 기기가 반복 자체를 지움 → A 연결
    → 기록이 다시 나타나지 않고 오류 안내도 없어야 함
 K) 지운 달 24개가 찬 반복에서 10월 기록을 지움 → 24개 그대로(가장 오래된 달이 빠짐), 다시 열어도 10월이 생기지 않음
종료 코드 0 = 모두 통과.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rec_lib import *  # noqa: F401,F403

A = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
B = emu.app_url(sys.argv[2]) if len(sys.argv) > 2 else A
CASES = os.environ.get('CASES', 'S,N,K').split(',')
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    if 'S' in CASES:
        uid, log = new_user(b, A, '2026-10-24T09:00:00+09:00'); RID = 'staleRec1'
        put(f'users/{uid}/recurring/{RID}', REC(lastPosted='2026-09'))
        put(f'users/{uid}/transactions/rec-{RID}-2026-09', TX(RID, '2026-09', origin='auto'))
        cb, pb = open_ctx(b, B, '2026-10-24T23:58:00+09:00', 'B', log); pb.wait_for_timeout(1000); day_check(pb)
        cb.set_offline(True); pb.wait_for_timeout(500)
        delete_tx(pb, f'rec-{RID}-2026-09', '2026-09')
        pb.clock.set_fixed_time('2026-10-25T00:00:30+09:00'); day_check(pb); pb.wait_for_timeout(2000)
        S = {'B_local': pb.evaluate("window.__gagyebu.state.txs.filter(t=>t.recurringId).map(t=>t.id)")}
        ca, pa = open_ctx(b, A, '2026-10-25T09:00:00+09:00', 'A', log); pa.wait_for_timeout(2500)
        S['srv_after_A_open'] = rows(uid)
        delete_tx(pa, f'rec-{RID}-2026-10'); pa.wait_for_timeout(1500)
        S['rec_after_A_delete'] = recs(uid)
        cb.set_offline(False); pb.wait_for_timeout(9000)
        S['srv_after_B_online'] = rows(uid); S['rec_after_B_online'] = recs(uid); S['toasts_A'] = toasts(pa); S['toasts_B'] = toasts(pb)
        ca.close(); cb.close()
        ca, pa = open_ctx(b, A, '2026-10-26T09:00:00+09:00', 'A2', log); pa.wait_for_timeout(3000); S['reopen_rows'] = rows(uid); ca.close()
        S['log'] = [x for x in log if 'Service Worker' not in x and 'DISCONN' not in x][:6]
        sk = sorted(S['rec_after_B_online'][0][2] or [])
        S['ok'] = S['srv_after_B_online'] == [] and sk == ['2026-09', '2026-10'] and S['reopen_rows'] == []
        R['S'] = S
    if 'N' in CASES:
        uid, log = new_user(b, A); RID = 'goneRec1'; T = f'rec-{RID}-2026-10'
        put(f'users/{uid}/recurring/{RID}', REC(lastPosted='2026-10'))
        put(f'users/{uid}/transactions/{T}', TX(RID, '2026-10', origin='auto'))
        ca, pa = open_ctx(b, A, '2026-10-26T09:00:00+09:00', 'A', log); pa.wait_for_timeout(1500)
        ca.set_offline(True); pa.wait_for_timeout(500)
        delete_tx(pa, T)
        delete(f'users/{uid}/recurring/{RID}')  # 다른 기기에서 반복을 지움
        pa.evaluate("window.__toasts=[]"); ca.set_offline(False); pa.wait_for_timeout(9000)
        S = {'srv_rows': rows(uid), 'A_view_has_T': pa.evaluate(f"window.__gagyebu.state.txs.some(t=>t.id==='{T}')"), 'toasts_A': toasts(pa)}
        S['log'] = [x for x in log if 'Service Worker' not in x and 'DISCONN' not in x][:6]; ca.close()
        S['ok'] = S['srv_rows'] == [] and not S['A_view_has_T'] and not any('저장하지 못' in t for t in S['toasts_A'])
        R['N'] = S
    if 'K' in CASES:
        uid, log = new_user(b, A); RID = 'skipRec1'
        sk = [f'{2024 + (i + 9) // 12}-{(i + 9) % 12 + 1:02d}' for i in range(24)]  # 2024-10 ~ 2026-09
        put(f'users/{uid}/recurring/{RID}', REC(startYm='2024-01', lastPosted='2026-09', skipped=sk))
        c, pg = open_ctx(b, A, '2026-10-26T09:00:00+09:00', 'X', log); pg.wait_for_timeout(3000)
        S = {'0_rows': rows(uid)}
        delete_tx(pg, f'rec-{RID}-2026-10'); pg.wait_for_timeout(1500)
        r = recs(uid)[0]; S['rows'] = rows(uid); S['skipped_len'] = len(r[2] or []); S['first_last'] = ((r[2] or [None])[0], (r[2] or [None])[-1]); S['toasts'] = toasts(pg)
        c.close()
        c, pg = open_ctx(b, A, '2026-10-27T09:00:00+09:00', 'X2', log); pg.wait_for_timeout(3000); S['reopen_rows'] = rows(uid); c.close()
        S['ok'] = S['rows'] == [] and S['skipped_len'] == 24 and sorted(r[2])[0] == '2024-11' and '2026-10' in r[2] and S['reopen_rows'] == []
        R['K'] = S
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
res = {k: ('통과' if v['ok'] else '실패') for k, v in R.items()}
print('경우별:', res)
sys.exit(0 if all(v['ok'] for v in R.values()) else 1)
