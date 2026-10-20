"""반복 자동 기록 e2e 검사 공용(deploy_order.py·multi_device.py). 에뮬레이터 주소·프로젝트는 emu.py를 따름."""
import json, os, sys, urllib.request as U
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: F401,E402

FS = emu.FS_DOCS
READY = 'window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0'
# 토스트를 모두 기록(사라지기 전에 바뀌는 것까지)
TOASTS = """(()=>{window.__toasts=[];const o=new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.classList.contains('show')){const s=t.innerText.replace(/\\n/g,' / ');if(window.__toasts[window.__toasts.length-1]!==s)window.__toasts.push(s)}});o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true})})()"""
H = {'Authorization': 'Bearer owner'}

def F(v):
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, list): return {'arrayValue': {'values': [F(x) for x in v]}}
    if isinstance(v, str) and v.startswith('TS:'): return {'timestampValue': v[3:]}
    return {'stringValue': v}

def put(path, fields):
    U.urlopen(U.Request(f'{FS}/{path}', data=json.dumps({'fields': {k: F(v) for k, v in fields.items()}}).encode(), method='PATCH', headers={**H, 'Content-Type': 'application/json'}))

def delete(path):
    U.urlopen(U.Request(f'{FS}/{path}', method='DELETE', headers=H))

def docs(path):
    def val(v):
        k = list(v)[0]; x = v[k]
        if k == 'integerValue': return int(x)
        if k == 'arrayValue': return [val(b) for b in x.get('values', [])]
        if k == 'mapValue': return {a: val(b) for a, b in x.get('fields', {}).items()}
        return x
    try: j = json.load(U.urlopen(U.Request(f'{FS}/{path}?pageSize=300', headers=H)))
    except Exception: return []
    out = []
    for d in j.get('documents', []):
        o = {a: val(b) for a, b in d.get('fields', {}).items()}; o['_id'] = d['name'].split('/')[-1]; out.append(o)
    return out

def rows(uid, ym=''):
    return sorted((t['_id'], t['amount']) for t in docs(f'users/{uid}/transactions') if t.get('recurringId') and t['date'].startswith(ym))

def recs(uid):
    return [(r['_id'], r.get('lastPosted'), r.get('skipped')) for r in docs(f'users/{uid}/recurring')]

def open_ctx(b, url, when, tag, log):
    c = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul', service_workers='block')
    pg = c.new_page(); pg.clock.set_fixed_time(when)
    pg.on('console', lambda m: log.append(f'{tag} {m.type}: {m.text[:160]}') if m.type in ('error', 'warning') or '건너뛰' in m.text else None)
    pg.on('pageerror', lambda e: log.append(f'{tag} pageerror: {e}'))
    pg.goto(url); pg.wait_for_timeout(1200)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인')
    pg.wait_for_function(READY, timeout=30000); pg.evaluate(TOASTS); pg.wait_for_timeout(2500)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    return c, pg

toasts = lambda pg: pg.evaluate('window.__toasts||[]')
day_check = lambda pg: pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")

def to_list(pg, ym='2026-10'):
    pg.evaluate("window.__gagyebu.go('calendar')"); pg.wait_for_timeout(400)
    pg.evaluate(f"window.__gagyebu.ui.viewYm='{ym}'; window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); pg.wait_for_timeout(800)

def delete_tx(pg, tx_id, ym='2026-10'):
    to_list(pg, ym); pg.click(f'[data-tx="{tx_id}"]'); pg.wait_for_timeout(600); pg.click('[data-del]'); pg.wait_for_timeout(700)
    if pg.locator('[role=alertdialog] [data-v="1"]').count(): pg.click('[role=alertdialog] [data-v="1"]')
    pg.wait_for_timeout(1500)

REC = lambda **k: {'name': '관리비', 'amount': 80000, 'kind': 'expense', 'categoryId': 'housing', 'dayOfMonth': 25, 'active': True, 'startYm': '2026-01', 'createdAt': 'TS:2026-01-01T00:00:00Z', **k}
TX = lambda rid, ym, amount=80000, memo='관리비', **k: {'date': f'{ym}-25', 'amount': amount, 'kind': 'expense', 'categoryId': 'housing', 'memo': memo, 'recurringId': rid, 'createdAt': f'TS:{ym}-25T00:00:00Z', **k}

def new_user(b, url, when='2026-10-26T09:00:00+09:00'):
    emu.reset(); log = []
    c, pg = open_ctx(b, url, when, 'X', log); uid = pg.evaluate('window.__gagyebu.state.user.uid'); c.close()
    return uid, log
