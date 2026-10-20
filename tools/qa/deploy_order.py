#!/usr/bin/env python3
"""배포 순서 검사(QA 3차 N1): 새 앱이 예전 규칙(배포본 640ff0f의 firestore.rules)에서 돌 때 자동 기록이 조용히·영구히 빠지지 않는지.
사용: 에뮬레이터 + VITE_USE_EMULATOR 미리보기를 띄운 뒤
  python3 tools/qa/deploy_order.py [앱 주소] [예전 규칙 파일(기본: git show 640ff0f:firestore.rules)]
경우: lastPosted 2026-09인 관리비(25일) 반복
 1) 예전 규칙 · 10-26에 열기 → 10월 기록이 안 생겨도 lastPosted는 09 그대로, 조용한 안내 1번
 2) 예전 규칙 · 11-26에 열기 → 그래도 09 그대로
 3) 새 규칙 배포(이 프로젝트에 저장소 firestore.rules를 다시 검) · 11-26에 다시 열기 → 10·11월 기록이 생기고 lastPosted 11
종료 코드 0 = 모두 통과.
"""
import json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rec_lib import *  # noqa: F401,F403

URL = emu.app_url(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/')
OLD = sys.argv[2] if len(sys.argv) > 2 else None
if not OLD:
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')
    OLD = os.path.join(tempfile.mkdtemp(), 'firestore.rules.640ff0f')
    open(OLD, 'w').write(subprocess.check_output(['git', '-C', root, 'show', '640ff0f:firestore.rules'], text=True))
R = {'url': URL, 'project': emu.PROJECT}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    uid, log = new_user(b, URL)
    emu.load_rules(OLD)  # 앱만 먼저 배포된 상황
    RID = 'plainRec1'
    put(f'users/{uid}/recurring/{RID}', REC(lastPosted='2026-09'))
    put(f'users/{uid}/transactions/rec-{RID}-2026-09', TX(RID, '2026-09', origin='auto'))
    c, pg = open_ctx(b, URL, '2026-10-26T09:00:00+09:00', 'old1', log); pg.wait_for_timeout(5000)
    R['1_old_rules_oct'] = {'rows': rows(uid), 'rec': recs(uid), 'toasts': toasts(pg)}; c.close()
    c, pg = open_ctx(b, URL, '2026-11-26T09:00:00+09:00', 'old2', log); pg.wait_for_timeout(5000)
    R['2_old_rules_nov'] = {'rows': rows(uid), 'rec': recs(uid), 'toasts': toasts(pg)}; c.close()
    emu.load_rules()  # 규칙 배포
    c, pg = open_ctx(b, URL, '2026-11-26T09:00:00+09:00', 'new', log); pg.wait_for_timeout(5000)
    R['3_new_rules_reopen'] = {'rows': rows(uid), 'rec': recs(uid), 'toasts': toasts(pg)}; c.close()
    b.close()
R['log'] = [x for x in log if 'Service Worker' not in x][:12]
lp = lambda k: R[k]['rec'][0][1]
ok = {
    '1 예전 규칙: lastPosted 09 그대로': lp('1_old_rules_oct') == '2026-09' and R['1_old_rules_oct']['rows'] == [(f'rec-{RID}-2026-09', 80000)],
    '1 예전 규칙: 조용한 안내': any('아직 못 남겼어요' in t for t in R['1_old_rules_oct']['toasts']),
    '2 예전 규칙(11월): lastPosted 09 그대로': lp('2_old_rules_nov') == '2026-09',
    '3 규칙 배포 뒤: 10·11월 기록 생김': [r[0] for r in R['3_new_rules_reopen']['rows']] == [f'rec-{RID}-2026-{m}' for m in ('09', '10', '11')],
    '3 규칙 배포 뒤: lastPosted 11': lp('3_new_rules_reopen') == '2026-11',
}
R['ok'] = ok
print(json.dumps(R, ensure_ascii=False, indent=1))
print('결과:', '통과' if all(ok.values()) else '실패', {k: ('통과' if v else '실패') for k, v in ok.items()})
sys.exit(0 if all(ok.values()) else 1)
