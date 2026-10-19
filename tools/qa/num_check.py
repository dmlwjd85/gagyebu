#!/usr/bin/env python3
"""금액 숫자 점검(QA N4·N5): ① 화면마다 금액이 든 글자에 tabular-nums가 빠진 곳 전수 ② 홈 큰 금액이 롤링하는 동안 폭이 흔들리는지.
사용: 에뮬레이터(auth 9099·firestore 8080) + VITE_USE_EMULATOR 미리보기 띄운 뒤
  python3 tools/qa/num_check.py [URL] [사진 접두사]
① 금액 = '숫자+원/만/억' 또는 '숫자%'가 든 글자(svg 축 글자 포함). 계산값 font-variant-numeric에 tabular-nums가 없으면 실패.
② 오늘 지출을 남겨 '오늘 쓸 돈'이 롤링하는 동안 프레임마다 글자 폭(Range)을 재서, 글자 수가 같은데 폭이 다르면 실패. 숫자 0~9 각각 10자 폭도 기록.
"""
import json, sys, urllib.request as U
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/gagyebu-num-'
import os
HOST = os.environ.get('GAGYEBU_EMU_HOST', '127.0.0.1')  # 다른 작업과 겹치지 않게 에뮬레이터 주소·프로젝트를 바꿀 수 있음
PROJ = os.environ.get('GAGYEBU_PROJECT', 'demo-gagyebu')
for u in [f'http://{HOST}:8080/emulator/v1/projects/{PROJ}/databases/(default)/documents', f'http://{HOST}:9099/emulator/v1/projects/{PROJ}/accounts']:
    U.urlopen(U.Request(u, method='DELETE'))
READY = 'window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0'
SCAN = r"""()=>{
 const money=/(^|[^0-9])[−+-]?[0-9][0-9,.]*\s*(원|만|억|%)/;
 const out=[];
 for (const e of document.querySelectorAll('body *')) {
  if (e.closest('script,style,title,.sr-only')) continue;
  const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  if (!own || !money.test(own)) continue;
  const r=e.getBoundingClientRect(); if (!r.width) continue;
  const cs=getComputedStyle(e);
  out.push({tag:e.tagName.toLowerCase(), cls:(e.getAttribute('class')||'').slice(0,50), text:own.slice(0,40), fvn:cs.fontVariantNumeric, tr:cs.textRendering});
 }
 return out;}"""
R = {'views': {}, 'roll': {}}
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    c = b.new_context(viewport={'width': 360, 'height': 800}, locale='ko-KR', timezone_id='Asia/Seoul'); pg = c.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.clock.set_fixed_time('2026-10-19T12:00:00+09:00')
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click('text=테스트 계정으로 로그인'); pg.wait_for_function(READY, timeout=20000); pg.wait_for_timeout(1500)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(2500)
    # 반복 제안이 뜨게 6달 같은 가맹점·같은 금액, 환불 1건
    pg.evaluate("""() => { const d = window.__gagyebu.data;
      for (const ym of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']) d.saveTx({ date: ym + '-16', amount: 550000, kind: 'expense', categoryId: 'housing', memo: '월세 집주인' });
      d.saveTx({ date: '2026-10-02', amount: -49000, kind: 'expense', categoryId: 'fashion', memo: '반품', importHash: '0123456789abcdef' });
      // D2: 저축 목표 카드 문장(한 달에 …씩 / 목표일이 지났어요 · … 남음 / … 남았어요 / 다 모음)도 검사 대상에 들게
      d.saveGoal({ name: '여행', emoji: '✈️', target: 3000000, saved: 1250000, due: '2027-06-30', order: 0 });
      d.saveGoal({ name: '노트북', emoji: '💻', target: 1800000, saved: 400000, due: '2026-09-30', order: 1 });
      d.saveGoal({ name: '비상금', emoji: '🛟', target: 1000000, saved: 111000, order: 2 });
      d.saveGoal({ name: '선물', emoji: '🎁', target: 200000, saved: 200000, order: 3 }); }""")
    pg.wait_for_timeout(2000)
    go = lambda v, w=800: (pg.evaluate(f"window.__gagyebu.go('{v}')"), pg.wait_for_timeout(w))
    for v in ['home', 'calendar', 'calendar-list', 'chart', 'chart-bar', 'budget', 'recurring', 'search', 'import', 'settings', 'sheet', 'toast']:
        if v == 'calendar-list':
            go('calendar', 300); pg.evaluate("window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); pg.wait_for_timeout(600)
        elif v == 'chart-bar':
            go('chart', 500); bar = pg.locator('[data-bar]').first
            if bar.count(): bar.click(); pg.wait_for_timeout(500)
        elif v == 'sheet':
            go('home', 300); pg.click('[aria-label^="새 기록 추가"]'); pg.wait_for_timeout(700)
            for k in '12000': pg.click(f'.key[data-key="{k}"]')
            pg.wait_for_timeout(400)
        elif v == 'toast':
            go('home', 300); pg.click('[aria-label^="새 기록 추가"]'); pg.wait_for_timeout(600)
            for k in '4500': pg.click(f'.key[data-key="{k}"]')
            if pg.locator('[data-cat="food"]').count(): pg.click('[data-cat="food"]')
            pg.click('[data-save]'); pg.wait_for_timeout(900)
        else:
            go(v)
        items = pg.evaluate(SCAN)
        R['views'][v] = {'n': len(items), 'not_tnum': [i for i in items if 'tabular-nums' not in i['fvn']], 'not_geo': len([i for i in items if i['tr'] != 'geometricprecision'])}
        if v == 'budget':
            R['goal_lines'] = [i for i in items if any(w in i['text'] for w in ('한 달에', '목표일이 지났어요', '남았어요'))]
        if v in ('recurring', 'chart', 'budget', 'toast'): pg.screenshot(path=f'{SHOT}num-{v}-360.png')
        if v == 'sheet': pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # ② 롤링 중 폭
    pg.evaluate("window.__gagyebu.data.setBudget('2026-10', 50000000)"); go('home', 1800)
    R['hero_before'] = pg.evaluate("document.querySelector('#hero-num').textContent")
    for amt in [1111, 8888, 40000, 7]:
        pg.evaluate("""()=>{window.__rec=[];const f=()=>{const el=document.querySelector('#hero-num');const g=document.createRange();g.selectNodeContents(el);const r=g.getBoundingClientRect();window.__rec.push([el.textContent,Math.round(r.width*1000)/1000]);if(window.__rec.length<70)requestAnimationFrame(f)};requestAnimationFrame(f)}""")
        pg.evaluate(f"window.__gagyebu.data.saveTx({{date:'2026-10-19',amount:{amt},kind:'expense',categoryId:'food',memo:'롤링'}})")
        pg.wait_for_timeout(1600)
        rec = pg.evaluate('window.__rec'); bylen = {}
        for t, w in rec: bylen.setdefault(len(t), set()).add(w)
        R['roll'][str(amt)] = {'frames': len(rec), 'texts': len({t for t, _ in rec}), 'width_by_len': {k: sorted(v) for k, v in sorted(bylen.items())}}
    R['glyph'] = pg.evaluate("""(()=>{const el=document.querySelector('#hero-num');const cs=getComputedStyle(el);const s=document.createElement('span');
      for (const k of ['fontFamily','fontSize','fontWeight','letterSpacing','textRendering','fontVariantNumeric']) s.style[k]=cs[k];
      s.style.position='absolute';document.body.appendChild(s);
      const w=[...'0123456789'].map(d=>{s.textContent=d.repeat(10);return Math.round(s.getBoundingClientRect().width*100)/1000});
      s.style.textRendering='auto'; const auto=[...'0123456789'].map(d=>{s.textContent=d.repeat(10);return Math.round(s.getBoundingClientRect().width*100)/1000});
      s.remove();return {now:w, without_geo:auto, font:cs.fontWeight+' '+cs.fontSize+' '+cs.textRendering}})()""")
    b.close()
R['page_errors'] = errs
print(json.dumps(R, ensure_ascii=False, indent=1))
miss = sum(len(v['not_tnum']) for v in R['views'].values()); total = sum(v['n'] for v in R['views'].values())
wobble = {k: {l: w for l, w in v['width_by_len'].items() if len(w) > 1} for k, v in R['roll'].items()}
wobble = {k: v for k, v in wobble.items() if v}
print(f'금액 글자 {total}곳 중 tabular-nums 빠짐 {miss}곳 · 롤링 폭 흔들림 {len(wobble)}건 · 숫자 폭 종류 {len(set(R["glyph"]["now"]))}')
goal_n = len(R.get('goal_lines', []))
print(f'저축 목표 카드 문장 검사 {goal_n}곳(3곳 기대)')
ok = goal_n >= 3 and miss == 0 and not wobble and len(set(R['glyph']['now'])) == 1 and not errs
print('결과:', '통과' if ok else '실패')
sys.exit(0 if ok else 1)
