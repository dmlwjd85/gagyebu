# 글자 대비 검사: axe-core 측정 + axe가 판정 못 한 글자는 화면 픽셀로 직접 측정. 사용: npm run emulators & npm run dev:emu 후 python3 tools/qa/contrast_axe.py
import urllib.request as U, json, sys
import os; sys.path.insert(0,os.path.dirname(__file__)); from pix import measure
for u in ['http://127.0.0.1:8080/emulator/v1/projects/demo-gagyebu/databases/(default)/documents','http://127.0.0.1:9099/emulator/v1/projects/demo-gagyebu/accounts']: U.urlopen(U.Request(u,method='DELETE'))
from playwright.sync_api import sync_playwright
AXE=open(''+os.path.join(os.path.dirname(__file__),'../../node_modules')+'/axe-core/axe.min.js').read()
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5173/gagyebu/'
RUN="""async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']},resultTypes:['violations']});
 return {v:r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.any[0]?.message||n.failureSummary||'').slice(0,140))})), cc:r.passes?0:0}}"""
CC="""async()=>{const r=await axe.run(document,{runOnly:['color-contrast'],resultTypes:['passes','violations','incomplete']});
 const vals=[];for(const k of ['passes','violations']) for(const v of r[k]) for(const n of v.nodes){const d=(n.any[0]||{}).data; if(d&&d.contrastRatio) vals.push(d.contrastRatio)}
 return {pass:r.passes.reduce((a,v)=>a+v.nodes.length,0),viol:r.violations.reduce((a,v)=>a+v.nodes.length,0),inc:r.incomplete.reduce((a,v)=>a+v.nodes.length,0),min:vals.length?Math.min(...vals):null,
   viols:r.violations.flatMap(v=>v.nodes.map(n=>n.target.join(' ')+' '+((n.any[0]||{}).data||{}).contrastRatio)).slice(0,8), incs:r.incomplete.flatMap(v=>v.nodes.map(n=>n.target.join(' ')+' '+((n.any[0]||{}).message||'').slice(0,60))).slice(0,6)}}"""
with sync_playwright() as p:
    b=p.chromium.launch(args=['--lang=ko-KR'])
    ctx=b.new_context(viewport={'width':360,'height':780},locale='ko-KR',color_scheme='light',reduced_motion='reduce')
    pg=ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(1200)
    def check(name):
        pg.wait_for_timeout(500); pg.add_script_tag(content=AXE)
        r=pg.evaluate(RUN); c=pg.evaluate(CC)
        print(f"[{name}] 대비 통과 {c['pass']} / 위반 {c['viol']} / 판정불가 {c['inc']} / 최저 {c['min']}")
        for x in c['viols']: print('   CC-VIOL', x)
        m=measure(pg); bad=[x for x in m if x[0]<x[1]]
        print(f"    픽셀측정 {len(m)}개, 최저 {min([x[0] for x in m]) if m else '-'}, 기준미달 {len(bad)}")
        for x in bad: print('    PIX-BAD', x)
        for v in r['v']: print('   ', v['id'], v['impact'], v['n'], v['ex'][:2])
    check('로그인-라이트')
    if 'login-test' in pg.content():
        pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(1500); pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(2500)
        pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:null,dismiss:{},excluded:[]}))")
        for theme in ['light','dark']:
            pg.evaluate(f"localStorage.setItem('theme','{theme}'); document.documentElement.classList.toggle('dark', '{theme}'==='dark')")
            for v in ['home','calendar','chart','budget','settings']:
                pg.evaluate(f"window.__gagyebu.go('{v}')")
                if v=='calendar': pg.click('.cal-cell >> nth=10')
                check(f'{v}-{theme}')
                if v=='chart':
                    pg.click('[data-chart-kind=saved]'); check(f'chart-saved-{theme}'); pg.click('[data-chart-kind=expense]')
            pg.evaluate("window.__gagyebu.go('home')"); pg.click('.fab'); pg.wait_for_timeout(400); pg.click('.cat-chip >> nth=0'); pg.click('.key[data-key=\"5\"]'); pg.click('[data-opts]')
            check(f'sheet-{theme}'); pg.keyboard.press('Escape')
    b.close()
