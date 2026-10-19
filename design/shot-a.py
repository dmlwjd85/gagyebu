# 확정 시안 A 화면 전체 촬영 + 새 화면 모아보기(screens-overview.png)
from playwright.sync_api import sync_playwright
import os
d=os.path.dirname(os.path.abspath(__file__));u='file://'+d+'/mockup.html?theme=a'
S=[('home-light',''),('home-dark','&mode=dark'),('sheet','&screen=sheet'),('sheet-dark','&screen=sheet&mode=dark'),('calendar','&screen=cal'),('calendar-dark','&screen=cal&mode=dark')]
for n in ('chart','budget','settings'):S+=[(n+'-light',f'&screen={n}'),(n+'-dark',f'&screen={n}&mode=dark')]
for k in range(1,6):S.append((f'import-{k}-light',f'&screen=import&step={k}'))
S.append(('import-2-dark','&screen=import&step=2&mode=dark'))
for n in ('chart','budget','settings'):S.append((n+'-dark',f'&screen={n}&mode=dark'))
S=list(dict.fromkeys(S))
errs=[]
with sync_playwright() as p:
 b=p.chromium.launch()
 for n,qs in S:
  pg=b.new_page(viewport={'width':360,'height':780},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(u+qs);pg.wait_for_timeout(1400);pg.screenshot(path=f'{d}/shot-{n}.png');pg.close()
 # 전체 길이(화면 아래 끝까지) 촬영
 for n,qs in [('home','&screen=home'),('calendar','&screen=cal'),('chart','&screen=chart'),('budget','&screen=budget'),('settings','&screen=settings'),('import-2','&screen=import&step=2')]:
  pg=b.new_page(viewport={'width':360,'height':780},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(u+qs);pg.wait_for_timeout(1200)
  h=pg.evaluate("()=>{const s=document.querySelector('.screen.on');const h=Math.max(780,s.scrollHeight);A.style.height=h+'px';return h}")
  pg.set_viewport_size({'width':360,'height':h});pg.wait_for_timeout(900);pg.screenshot(path=f'{d}/full-{n}-light.png');pg.close()
 # PC 1280 촬영
 for n,qs in [('home',''),('chart','&screen=chart'),('home-dark','&mode=dark'),('chart-dark','&screen=chart&mode=dark')]:
  pg=b.new_page(viewport={'width':1280,'height':800});pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(u+qs);pg.wait_for_timeout(1400);pg.screenshot(path=f'{d}/pc-{n}.png');pg.close()
 names=[('차트','chart-light'),('예산','budget-light'),('설정','settings-light'),('가져오기 · 열 맞추기','import-2-light')]
 html="<html><head><link rel=stylesheet href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'></head><body style=\"margin:0;background:#E6E3F0;font-family:'Pretendard Variable',sans-serif;color:#1E1B3A\"><div style='display:flex;gap:24px;padding:24px'>"+''.join(f"<figure style='margin:0'><figcaption style='font-size:22px;font-weight:800;margin-bottom:12px'>{t} <span style='font-size:14px;font-weight:600;opacity:.7'>시안 A · 라이트</span></figcaption><img src='shot-{f}.png' width=360 height=780 style='border-radius:20px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.18)'></figure>" for t,f in names)+"</div></body></html>"
 open(d+'/_ov.html','w').write(html)
 pg=b.new_page(viewport={'width':1560,'height':900});pg.goto('file://'+d+'/_ov.html');pg.wait_for_timeout(1200);pg.screenshot(path=d+'/screens-overview.png',full_page=True);pg.close()
 os.remove(d+'/_ov.html');b.close()
print('JS 오류:',errs or '없음')
