# 홈 카드에서 글자를 숨기고 배경 픽셀 중 가장 밝은(최악) 지점을 찾아 흰 글자 대비를 계산
from playwright.sync_api import sync_playwright
from PIL import Image
import os,io
d=os.path.dirname(os.path.abspath(__file__))
def L(p):
  c=[x/255 for x in p[:3]];c=[x/12.92 if x<=.03928 else ((x+.055)/1.055)**2.4 for x in c];return .2126*c[0]+.7152*c[1]+.0722*c[2]
with sync_playwright() as p:
 b=p.chromium.launch()
 for mode in ('light','dark'):
  pg=b.new_page(viewport={'width':360,'height':780})
  pg.goto(f'file://{d}/mockup.html?theme=a'+('&mode=dark' if mode=='dark' else ''));pg.wait_for_timeout(1500)
  pg.add_style_tag(content='.hero *{visibility:hidden!important}')
  # 글자 요소(날씨 줄·라벨·큰 숫자·하단 두 문구)의 영역 안 배경만 측정
  mx=0
  for sel in ['.wx','.lab','.big','.barl span >> nth=0','.barl span >> nth=1']:
   bx=pg.locator('.hero '+sel).bounding_box()
   im=Image.open(io.BytesIO(pg.screenshot(clip=bx))).convert('RGB')
   mx=max(mx,max(L(px) for px in im.get_flattened_data() if True))
  print(mode,'최악 지점 대비(흰 글자)',round(1.05/(mx+.05),2));pg.close()
 b.close()
