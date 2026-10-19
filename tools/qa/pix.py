# axe가 판정 못 한(그라데이션·유리 배경) 글자를 화면 픽셀로 직접 측정: 글자를 투명하게 한 뒤 글자 상자 안 배경 픽셀과 글자색의 대비를 계산(하위 2% 값)
import io, json
from PIL import Image
def lum(c):
    def ch(v):
        v=v/255; return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2])
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
GET="""async()=>{const r=await axe.run(document,{runOnly:['color-contrast'],resultTypes:['incomplete']});
 const out=[];let i=0;for(const v of r.incomplete) for(const n of v.nodes){const el=document.querySelector(n.target[0]); if(!el) continue; const msg=(n.any[0]||{}).message||''; if(/non-text|too short/.test(msg)) continue;
  const b=el.getBoundingClientRect(); if(b.width<2) continue; const c=getComputedStyle(el).color.match(/[\\d.]+/g).map(Number); el.dataset.pix=i; out.push({i:i++,sel:n.target[0],c,box:[b.x,b.y,b.width,b.height],fs:parseFloat(getComputedStyle(el).fontSize),fw:+getComputedStyle(el).fontWeight})}
 return out}"""
def measure(pg):
    items=pg.evaluate(GET); res=[]
    for it in items:
        pg.evaluate(f"(()=>{{const e=document.querySelector('[data-pix=\"{it['i']}\"]'); e.dataset.oc=e.style.cssText; e.style.setProperty('color','transparent','important'); e.style.setProperty('text-shadow','none','important'); e.querySelectorAll('*').forEach(x=>{{x.style.setProperty('color','transparent','important');x.style.setProperty('text-shadow','none','important')}})}})()")
        b=pg.evaluate(f"(()=>{{const e=document.querySelector('[data-pix=\"{it['i']}\"]'); e.scrollIntoView({{block:'center'}}); const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]}})()")
        x,y,w,h=b; vw,vh=pg.viewport_size['width'],pg.viewport_size['height']
        x2,y2=min(vw,x+w),min(vh,y+h); x,y=max(0,x),max(0,y); w,h=x2-x,y2-y
        if w<1 or h<1: continue
        img=Image.open(io.BytesIO(pg.screenshot(clip={'x':x,'y':y,'width':w,'height':h}))).convert('RGB')
        pg.evaluate(f"(()=>{{const e=document.querySelector('[data-pix=\"{it['i']}\"]'); e.style.cssText=e.dataset.oc; e.querySelectorAll('*').forEach(x=>{{x.style.removeProperty('color');x.style.removeProperty('text-shadow')}})}})()")
        px=list(img.getdata())[::3]; rs=sorted(ratio(it['c'][:3],p) for p in px)
        r=rs[int(len(rs)*0.02)] if rs else 99
        large = it['fs']>=24 or (it['fs']>=18.66 and it['fw']>=700)
        res.append((round(r,2), 3.0 if large else 4.5, it['sel'][:60]))
    return res
