# 홈 카드 수정 전(보관 이미지)과 수정 후(현재 화면) 비교 이미지
from playwright.sync_api import sync_playwright
from PIL import Image
import os,shutil
d=os.path.dirname(os.path.abspath(__file__));t='/tmp/ba'
os.makedirs(t,exist_ok=True)
for n,src in [('bl',f'{d}/_before-light.png'),('al',f'{d}/shot-home-light.png'),('bd',f'{d}/_before-dark.png'),('ad',f'{d}/shot-home-dark.png')]:
  Image.open(src).crop((0,0,720,700)).save(f'{t}/{n}.png')
html=f"""<html><head><link rel=stylesheet href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'></head><body style="margin:0;background:#E6E3F0;font-family:'Pretendard Variable',sans-serif;color:#1E1B3A;padding:24px;width:max-content">
<div style="display:grid;grid-template-columns:repeat(2,360px);gap:16px 24px">
<b style="font-size:20px">수정 전 · 흰 글자 최저 2.1:1 ✗</b><b style="font-size:20px">수정 후 · 흰 글자 최저 4.61:1 ✓</b>
<img src="{t}/bl.png" width=360><img src="{t}/al.png" width=360>
<span style="font-size:15px;font-weight:700">다크 모드 · 수정 전</span><span style="font-size:15px;font-weight:700">다크 모드 · 수정 후</span>
<img src="{t}/bd.png" width=360><img src="{t}/ad.png" width=360></div>
<p style="font-size:14px;margin:16px 0 0;line-height:21px">그라데이션 #7B5CFF → #E86FA5 → #F2A06E ⟶ #7048F2 → #C2457E → #B85A3E<br>측정: 카드 위 글자 영역 배경 중 가장 밝은 화소 기준 (measure.py). 수정 전 칸의 숫자(18,400원)는 당시 예시 데이터예요.</p></body></html>"""
open(t+'/ba.html','w').write(html)
with sync_playwright() as p:
  b=p.chromium.launch();pg=b.new_page(viewport={'width':800,'height':600});pg.goto('file://'+t+'/ba.html');pg.wait_for_timeout(1200);pg.screenshot(path=d+'/before-after.png',full_page=True);b.close()
