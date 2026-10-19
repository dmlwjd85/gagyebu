from playwright.sync_api import sync_playwright
import os
d=os.path.dirname(os.path.abspath(__file__));u='file://'+d+'/mockup.html'
shots=[('home-light',''),('home-dark','&mode=dark'),('sheet','&screen=sheet'),('calendar','&screen=cal'),('sheet-dark','&screen=sheet&mode=dark')]
with sync_playwright() as p:
 b=p.chromium.launch()
 for t in 'abcd':
  for name,qs in shots:
   if t!='a' and name in('calendar','sheet-dark'):continue
   pg=b.new_page(viewport={'width':360,'height':780},device_scale_factor=2)
   pg.goto(f'{u}?theme={t}{qs}');pg.wait_for_timeout(1500)
   pg.screenshot(path=f'{d}/shot-{name}.png' if t=='a' else f'{d}/shot-{t}-{name}.png');pg.close()
 b.close()
f=lambda t,n:f'shot-{n}.png' if t=='a' else f'shot-{t}-{n}.png'
names=['A 오로라 파스텔','B 민트 스카이','C 포레스트 골드','D 모노 볼트']
with sync_playwright() as p:
 b=p.chromium.launch()
 for n,o in [('home-light','compare-light.png'),('home-dark','compare-dark.png')]:
  lt='light' in n
  html=f"""<html><head><link rel=stylesheet href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'></head><body style="margin:0;background:{'#E6E3F0' if lt else '#16151F'};font-family:'Pretendard Variable',sans-serif;color:{'#1E1B3A' if lt else '#F3F1FF'}"><div style="display:flex;gap:24px;padding:24px">"""+''.join(f"<figure style='margin:0'><figcaption style='font-size:22px;font-weight:800;margin-bottom:12px'>{names[i]} <span style='font-weight:500;font-size:15px;opacity:.75'>{'라이트' if lt else '다크'}</span></figcaption><img src='{f(t,n)}' width=360 height=780 style='border-radius:20px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.18)'></figure>" for i,t in enumerate('abcd'))+"</div></body></html>"
  open(d+'/_cmp.html','w').write(html)
  pg=b.new_page(viewport={'width':24*5+360*4,'height':780+48+46},device_scale_factor=1)
  pg.goto('file://'+d+'/_cmp.html');pg.wait_for_timeout(1200);pg.screenshot(path=f'{d}/{o}',full_page=True);pg.close()
 b.close()
import os as _o;_o.remove(d+'/_cmp.html')
