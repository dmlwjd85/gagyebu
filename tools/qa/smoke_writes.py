#!/usr/bin/env python3
"""앱의 모든 쓰기 경로를 에뮬레이터에서 한 번씩 돌리고 권한 오류 0건을 확인(QA 4차 R1 교훈).
사용: 에뮬레이터(auth 9099·firestore 8080) + VITE_USE_EMULATOR 미리보기 띄운 뒤
  python3 tools/qa/smoke_writes.py [URL]
종료 코드 0 = 권한 오류 없음·핵심 기록이 서버에 있음.
"""
import json, sys, urllib.request as U
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
PROJ = 'demo-gagyebu'
FS = f'http://127.0.0.1:8080/v1/projects/{PROJ}/databases/(default)/documents'
SHOT = '/workspace/gagyebu-m2fix4-'

def wipe():
    for u in [f'http://127.0.0.1:8080/emulator/v1/projects/{PROJ}/databases/(default)/documents',
              f'http://127.0.0.1:9099/emulator/v1/projects/{PROJ}/accounts']:
        U.urlopen(U.Request(u, method='DELETE'))

def val(v):
    k = list(v.keys())[0]; x = v[k]
    if k == 'integerValue': return int(x)
    if k == 'booleanValue': return bool(x)
    if k == 'mapValue': return {a: val(b) for a, b in x.get('fields', {}).items()}
    if k == 'arrayValue': return [val(b) for b in x.get('values', [])]
    return x

def docs(path):
    out, tok = [], ''
    while True:
        r = U.urlopen(U.Request(f'{FS}/{path}?pageSize=300' + (f'&pageToken={tok}' if tok else ''),
                                headers={'Authorization': 'Bearer owner'}))
        j = json.load(r)
        for d in j.get('documents', []):
            o = {a: val(b) for a, b in d.get('fields', {}).items()}; o['_id'] = d['name'].split('/')[-1]; out.append(o)
        tok = j.get('nextPageToken')
        if not tok: return out

def main():
    wipe()
    errs, perm, results = [], [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--lang=ko-KR'])
        ctx = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(f'page:{e}'))
        pg.on('console', lambda m: (perm.append(m.text) if m.type == 'error' and 'permission' in m.text.lower() else None,
                                    errs.append(m.text) if m.type == 'error' and 'PERMISSION' in m.text else None))
        pg.goto(URL); pg.wait_for_timeout(1200)
        pg.click('text=테스트 계정으로 로그인')
        pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0', timeout=20000)
        pg.wait_for_timeout(1000)
        pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
        uid = pg.evaluate('window.__gagyebu.state.user.uid')

        # 1) 거래 입력·수정·삭제·되돌리기
        tid = pg.evaluate("""async () => {
          const d = window.__gagyebu.data;
          const id = d.saveTx({ date: '2026-10-15', amount: 12000, kind: 'expense', categoryId: 'food', memo: '스모크 김밥', accountId: 'card' });
          await new Promise(r => setTimeout(r, 800));
          d.saveTx({ id, date: '2026-10-15', amount: 13000, kind: 'expense', categoryId: 'food', memo: '스모크 김밥 수정', accountId: 'card' });
          await new Promise(r => setTimeout(r, 800));
          const before = window.__gagyebu.state.txs.find(t => t.id === id);
          d.deleteTx(id);
          await new Promise(r => setTimeout(r, 600));
          d.restoreTx(before);
          await new Promise(r => setTimeout(r, 800));
          return id;
        }""")
        results['tx'] = any(t['_id'] == tid and t.get('amount') == 13000 for t in docs(f'users/{uid}/transactions'))

        # 2) 반복 거래 + 자동 기록(rec- id) — lastPosted 없이 과거 startYm
        rec = pg.evaluate("""async () => {
          const d = window.__gagyebu.data;
          const id = d.saveRecurring({ name: '스모크월세', amount: 550000, kind: 'expense', categoryId: 'housing',
            dayOfMonth: 1, active: true, startYm: '2026-08' });
          await new Promise(r => setTimeout(r, 500));
          d.postRecurring(new Date().toISOString().slice(0, 10));
          await new Promise(r => setTimeout(r, 2000));
          return id;
        }""")
        txs = docs(f'users/{uid}/transactions')
        rec_txs = [t for t in txs if t.get('recurringId') == rec]
        results['recurring_auto'] = len(rec_txs) >= 1 and all(t['_id'].startswith('rec-') for t in rec_txs)
        results['recurring_ids'] = [t['_id'] for t in rec_txs]

        # 3) 반복으로 생긴 거래 수정·삭제·되돌리기(같은 rec- id)
        if rec_txs:
            rid = rec_txs[0]['_id']
            ok = pg.evaluate(f"""async () => {{
              const d = window.__gagyebu.data;
              const t = window.__gagyebu.state.txs.find(x => x.id === '{rid}');
              if (!t) return 'missing';
              d.saveTx({{ ...t, amount: 560000, memo: '스모크월세 수정' }});
              await new Promise(r => setTimeout(r, 800));
              const before = window.__gagyebu.state.txs.find(x => x.id === '{rid}');
              d.deleteTx('{rid}');
              await new Promise(r => setTimeout(r, 600));
              d.restoreTx(before);
              await new Promise(r => setTimeout(r, 1000));
              const after = window.__gagyebu.state.txs.find(x => x.id === '{rid}');
              return after && after.amount === 560000 ? 'ok' : 'fail';
            }}""")
            results['recurring_edit_undo'] = ok == 'ok'
            pg.screenshot(path=f'{SHOT}smoke-rec-undo-360.png', full_page=True)
        else:
            results['recurring_edit_undo'] = False

        # 4) 카테고리·결제수단·규칙·목표·예산
        pg.evaluate("""async () => {
          const d = window.__gagyebu.data, s = window.__gagyebu.state;
          d.saveCategory({ name: '스모크카테', emoji: '🧪', kind: 'expense', order: 99 });
          d.saveAccount({ name: '스모크카드', emoji: '💳', type: 'card', order: 9 });
          d.saveRule({ match: '스모크가맹점', categoryId: 'food' });
          d.saveGoal({ name: '스모크목표', emoji: '🎯', target: 100000, saved: 1000, order: 0 });
          d.setBudget('2026-10', 500000, { food: 100000, cafe: 50000 });
          await new Promise(r => setTimeout(r, 1200));
        }""")
        results['category'] = any(c.get('name') == '스모크카테' for c in docs(f'users/{uid}/categories'))
        results['account'] = any(a.get('name') == '스모크카드' for a in docs(f'users/{uid}/accounts'))
        results['rule'] = any(r.get('match') == '스모크가맹점' for r in docs(f'users/{uid}/rules'))
        results['goal'] = any(g.get('name') == '스모크목표' for g in docs(f'users/{uid}/goals'))
        results['budget'] = any(b['_id'] == '2026-10' and b.get('total') == 500000 for b in docs(f'users/{uid}/budgets'))

        # 5) 가져오기 · 되돌리기 (UI 단계 대신 data API로 권한·묶음 id를 직접 검증)
        batch = pg.evaluate("""async () => {
          const d = window.__gagyebu.data;
          const batchId = 'imp-' + Date.now().toString(36);
          const items = [
            { date: '2026-09-01', amount: 5000, kind: 'expense', categoryId: 'food', memo: '스모크가져오기1', importHash: 'aaaaaaaaaaaaaaaa' },
            { date: '2026-09-02', amount: 7000, kind: 'expense', categoryId: 'cafe', memo: '스모크가져오기2', importHash: 'bbbbbbbbbbbbbbbb' },
          ];
          d.importTxs(items, batchId, { from: '2026-09-01', to: '2026-09-02', label: '스모크' });
          await new Promise(r => setTimeout(r, 1500));
          const n1 = window.__gagyebu.state.txs.filter(t => t.importBatch === batchId).length;
          await d.undoImport(batchId);
          await new Promise(r => setTimeout(r, 1500));
          const n2 = window.__gagyebu.state.txs.filter(t => t.importBatch === batchId).length;
          return { batchId, n1, n2 };
        }""")
        results['import'] = batch['n1'] == 2
        results['import_undo'] = batch['n2'] == 0
        results['import_batch'] = batch['batchId']

        # 6) 토스트에 잘못된 '다시 로그인' 안내가 반복 자동 기록 때 뜨지 않는지
        toast = pg.evaluate("document.getElementById('toast')?.textContent || ''")
        results['no_wrong_login_toast'] = '다시 로그인' not in toast

        pg.screenshot(path=f'{SHOT}smoke-home-360.png', full_page=True)
        ctx.close(); b.close()

    perm_unique = sorted(set(perm))
    fails = [k for k, v in results.items() if v is False]
    print(json.dumps({'uid': uid, 'results': results, 'permission_errors': perm_unique, 'other_errors': errs[:10], 'fails': fails}, ensure_ascii=False, indent=1))
    if fails or perm_unique:
        sys.exit(1)

if __name__ == '__main__':
    main()
