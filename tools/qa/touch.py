# 누르는 영역 44px 검사(스위치 제외: 스위치는 ::before로 52×44). 사용: python3 tools/qa/touch.py [URL]
import urllib.request as U, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import emu  # 에뮬레이터 주소·프로젝트(emu.py 참고)
URL=emu.app_url(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5173/gagyebu/')
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'../../samples/')
emu.reset()  # 이 실행의 프로젝트(demo-qa-<pid>)만 지움
from playwright.sync_api import sync_playwright
JS="""()=>[...document.querySelectorAll('button,a,input,select,[role=button],[role=radio]')].filter(e=>{const r=e.getBoundingClientRect();const st=getComputedStyle(e);return r.width>0&&r.height>0&&st.visibility!='hidden'&&!e.closest('.switch')&&e.type!='checkbox'&&!(e.closest('#sheet-root')&&!document.querySelector('#sheet-root.open'))}).map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),(e.className||'').toString().slice(0,30),(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,15)]}).filter(([w,h])=>w<44||h<44)"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':360,'height':780})
    pg.goto(URL); pg.wait_for_timeout(1200)
    print('login',pg.evaluate(JS))
    pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(1500); pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(3000)
    for v in ['home','calendar','chart','budget','settings']:
        pg.evaluate(f"window.__gagyebu.go('{v}')"); pg.wait_for_timeout(500)
        if v=='budget': pg.click('[data-toggle-env]'); pg.wait_for_timeout(300)
        if v=='settings': pg.click('[data-emoji-for="food"]'); pg.wait_for_timeout(200)
        print(v,pg.evaluate(JS))
    pg.evaluate("""(()=>{const g=window.__gagyebu, d=g.data, c=g.state.categories.find(c=>c.kind==='expense');
      d.saveGoal({name:'제주 여행', target:1200000, saved:400000}); d.saveRecurring({name:'월세', amount:550000, kind:'expense', categoryId:c.id, dayOfMonth:25, active:true, startYm:'2026-10', lastPosted:'2026-10'}); d.saveRule({match:'스타벅스', categoryId:c.id});})()"""); pg.wait_for_timeout(800)
    for v in ['budget','settings','recurring','search']:
        pg.evaluate(f"window.__gagyebu.go('{v}')"); pg.wait_for_timeout(700)
        if v=='search': pg.fill('[data-search-q]','마트'); pg.wait_for_timeout(600)
        print(v+'(M2)',pg.evaluate(JS))
    pg.evaluate("window.__gagyebu.go('import')"); pg.wait_for_timeout(600); print('import1',pg.evaluate(JS))
    pg.set_input_files('[data-imp-file]', S+'일반_예시.csv'); pg.wait_for_timeout(1000); print('import2',pg.evaluate(JS))
    pg.click('[data-imp-next]'); pg.wait_for_timeout(1200); print('import3',pg.evaluate(JS))
    pg.click('[data-imp-next]'); pg.wait_for_timeout(300); print('import4',pg.evaluate(JS))
    pg.evaluate("window.__gagyebu.go('chart')"); pg.click('[data-action=report]'); pg.wait_for_timeout(2000); print('report',pg.evaluate(JS)); pg.click('[data-rp=close]')
    pg.evaluate("window.__gagyebu.go('home')"); pg.click('.fab'); pg.wait_for_timeout(400); pg.click('[data-opts]'); print('sheet',pg.evaluate(JS))
    b.close()
