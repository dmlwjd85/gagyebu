#!/usr/bin/env python3
"""예전 앱 되돌리기 중복 검사(QA 3차 한계 ④): createdAt 없는 일반 기록을 예전 앱에서 고친 뒤 [되돌리기].
사용: QA_PROJECT=<예전 앱 빌드의 프로젝트> [QA_RULES=규칙 파일] python3 tools/qa/old_undo.py 예전앱주소
기대(이 브랜치 규칙): '저녁' 기록이 한 건(30,000원)만 남고 새 기록을 만들지 않음.
수정 전 규칙(3f6a9e1 앞)으로 걸면: 35,000원 + 새로 살린 30,000원 두 건(금액이 두 번 잡힘)."""
import json, sys
from rec_lib import emu, sync_playwright, put, docs, open_ctx, toasts, to_list, new_user
URL = emu.app_url(sys.argv[1]); R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    uid, log = new_user(b, URL)
    put(f'users/{uid}/transactions/noCa1', {'date': '2026-10-10', 'amount': 30000, 'kind': 'expense', 'categoryId': 'food', 'memo': '저녁'})  # createdAt 없음
    c, pg = open_ctx(b, URL, '2026-10-26T09:00:00+09:00', 'OLD', log)
    to_list(pg); pg.click('[data-tx="noCa1"]'); pg.wait_for_timeout(600)
    for _ in range(10): pg.click('.key[data-key="⌫"]')
    for k in '35000': pg.click(f'.key[data-key="{k}"]')
    pg.click('[data-save]'); pg.wait_for_timeout(2500)
    R['고친 뒤'] = sorted((t['_id'], t['amount']) for t in docs(f'users/{uid}/transactions') if t.get('memo') == '저녁')
    pg.click('#toast.show .toast-btn'); pg.wait_for_timeout(3000)
    R['되돌린 뒤'] = sorted((t['_id'], t['amount']) for t in docs(f'users/{uid}/transactions') if t.get('memo') == '저녁')
    R['토스트'] = toasts(pg); c.close(); b.close()
print(json.dumps(R, ensure_ascii=False))
ok = R['되돌린 뒤'] == [('noCa1', 30000)]
print('결과:', '통과' if ok else '실패'); sys.exit(0 if ok else 1)
