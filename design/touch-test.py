# 모든 화면에서 보이는 터치 대상(버튼·선택·입력·링크)이 44×44px 이상인지 검사
from playwright.sync_api import sync_playwright
import os,json
d=os.path.dirname(os.path.abspath(__file__))
SC=[('home',''),('sheet','&screen=sheet'),('cal','&screen=cal'),('chart','&screen=chart'),('budget','&screen=budget'),('settings','&screen=settings')]+[(f'import{k}',f'&screen=import&step={k}') for k in range(1,6)]
JS="""()=>{const out=[];for(const e of document.querySelectorAll('button,select,input,a,label.btn2')){if(e.type==='file')continue;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);
 if(!r.width||cs.visibility==='hidden'||!e.offsetParent&&cs.position!=='fixed')continue;if(r.bottom<0||r.top>window.innerHeight*3)continue;
 if(r.width<44-0.5||r.height<44-0.5)out.push((e.getAttribute('aria-label')||e.textContent.trim()).slice(0,18)+' '+Math.round(r.width)+'x'+Math.round(r.height))}return out}"""
bad={}
with sync_playwright() as p:
 b=p.chromium.launch()
 for n,q in SC:
  pg=b.new_page(viewport={'width':360,'height':780});pg.goto(f'file://{d}/mockup.html?x=1{q}');pg.wait_for_timeout(700)
  r=pg.evaluate(JS)
  if n=='cal':
   pg.click('#calt2 [data-v=list]');r+=pg.evaluate(JS)
  if n=='settings':
   pg.click('#emgrid .emc >> nth=0');r+=pg.evaluate(JS);pg.keyboard.press('Escape');pg.click('text=결제수단');r+=pg.evaluate(JS);pg.keyboard.press('Escape')
   pg.click('text=계정과 모든 기록 삭제');r+=pg.evaluate(JS)
  if n=='budget':
   pg.click('#budget .ib');r+=pg.evaluate(JS)
  if r:bad[n]=sorted(set(r))
  pg.close()
 for w in (1280,):
  pg=b.new_page(viewport={'width':w,'height':800});pg.goto(f'file://{d}/mockup.html');pg.wait_for_timeout(700);r=pg.evaluate(JS)
  if r:bad['pc-home']=r
 b.close()
print(json.dumps(bad,ensure_ascii=False,indent=1) if bad else '44px 미만 터치 대상 없음')
