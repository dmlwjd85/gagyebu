#!/usr/bin/env python3
"""새 버전 안내 줄 좁은 화면·큰 글자 검사(QA 6차 1).
사용: QA_EMU_HOST=127.0.0.x python3 tools/qa/update_bar.py 주소 [사진 접두사]
폭 160/240/320/360/390 × 브라우저 확대 100/200%(뷰포트를 확대만큼 줄임) × 본문 글자 100/130/160%에서
안내 줄 높이,
(160px@200%는 CSS 폭 80px로 #9가 지원하는 최소 폭 160px보다 좁아 '한 글자씩 꺾임'은 참고로만 표시하고, 버튼 잘림·토스트 겹침은 그대로 봄) 글자 칸 폭(em)·줄 수, 버튼 잘림(줄 밖·화면 밖·글자 넘침), 오프라인 토스트와 버튼 겹침, 가로 넘침을 잼. 하나라도 문제면 종료 코드 1."""
import json, sys
from rec_lib import emu, sync_playwright, open_ctx, new_user
URL = emu.app_url(sys.argv[1]); SHOT = sys.argv[2] if len(sys.argv) > 2 else None
T = '2026-10-20T09:00:00+09:00'; HS = {160: 640, 240: 640, 320: 640, 360: 640, 390: 844}
M = """()=>{const q=s=>document.querySelector(s), R=e=>e.getBoundingClientRect();
 const bar=q('.update-bar'), sp=bar.querySelector('span'), btn=q('.update-btn'), t=q('#toast.show');
 const b=R(bar), s=R(sp), k=R(btn), fs=parseFloat(getComputedStyle(sp).fontSize);
 const rg=document.createRange(); rg.selectNodeContents(sp); const lines=new Set([...rg.getClientRects()].map(r=>Math.round(r.top))).size;
 const ov=(a,c)=>a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom;
 return {barH:Math.round(b.height), spanEm:+(s.width/fs).toFixed(1), lines, chars:sp.textContent.length,
  btnOut:Math.max(0,b.left-k.left,k.right-b.right,k.bottom-b.bottom,b.top-k.top), btnOffscreen:Math.max(0,-k.left,k.right-innerWidth),
  btnTextOver:Math.max(0,btn.scrollWidth-btn.clientWidth), btnH:Math.round(k.height),
  toastHit: !!(t && ov(R(t),k)), toastShown: !!t, hscroll: document.documentElement.scrollWidth-document.documentElement.clientWidth}}"""
rows, bad = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR']); uid, log = new_user(b, URL, T)
    c, pg = open_ctx(b, URL, T, 'N', log)
    def case(W, z, f, theme='light'):
        pg.set_viewport_size({'width': round(W / z), 'height': round(HS[W] / z)})
        pg.evaluate(f"(()=>{{localStorage.setItem('contentScale','{f}'); document.documentElement.style.setProperty('--content-scale','{f}'); localStorage.setItem('theme','{theme}'); document.documentElement.classList.toggle('dark',{str(theme=='dark').lower()}); const t=document.querySelector('#toast'); if(t) t.classList.remove('show'); window.__gagyebu.go('home'); window.__gagyebu.ui.updateReady=true; window.__gagyebu.render(); document.querySelector('#main').scrollTop=0; window.scrollTo(0,0)}})()")
        pg.wait_for_timeout(350); pg.evaluate("window.dispatchEvent(new Event('offline'))"); pg.wait_for_timeout(450)
        return pg.evaluate(M)
    for W in HS:
        for z in (1, 2):
            for f in (1, 1.3, 1.6):
                r = case(W, z, f); r.update(W=W, zoom=f'{int(z*100)}%', font=f'{int(f*100)}%'); rows.append(r)
                prob = [k for k, ok in (('버튼 잘림', r['btnOut'] < 1 and r['btnOffscreen'] < 1 and r['btnTextOver'] < 1), ('토스트 겹침', not r['toastHit']),
                        ('한 글자씩 꺾임', W / z < 160 or r['lines'] <= 1 or r['chars'] / r['lines'] >= 3), ('가로 넘침', r['hscroll'] <= 0), ('토스트 안 뜸', r['toastShown'])) if not ok]
                if prob: bad.append((W, r['zoom'], r['font'], prob))
                print(f"{W:>4}px {r['zoom']:>4} 글자 {r['font']:>4}: 줄 높이 {r['barH']:>3}px 글자칸 {r['spanEm']:>4}em {r['lines']}줄 버튼 {r['btnH']}px 잘림 {r['btnOut']+r['btnOffscreen']+r['btnTextOver']:.0f} 토스트겹침 {int(r['toastHit'])} {'· '+','.join(prob) if prob else ''}", flush=True)
    if SHOT:
        for theme in ('light', 'dark'):
            for f in (1, 1.6):
                case(360, 2, f, theme); pg.screenshot(path=f'{SHOT}{theme}-360-z200-f{int(f*100)}.png')
    c.close(); b.close()
print(f'검사 {len(rows)}조합, 문제 {len(bad)}', json.dumps(bad, ensure_ascii=False))
sys.exit(1 if bad else 0)
