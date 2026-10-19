import json,re
# key: bg solid ink sub primary onp exp inc a1 a2 a3 g1 g2 g3 hi(hero ink) fab1 fab2 fabi bar track
P={
'a':{'light':dict(bg='#F6F4FF',solid='#FFFFFF',ink='#1E1B3A',sub='#5B5775',primary='#6D4AFF',onp='#FFFFFF',exp='#CC2A48',inc='#0B7A55',a1='#FFD6E8',a2='#D6E4FF',a3='#E3FFF1',g1='#7048F2',g2='#C2457E',g3='#B85A3E',hi='#FFFFFF',fab1='#7B5CFF',fab2='#E86FA5',fabi='#FFFFFF',bar='#FFFFFF',track='rgba(255,255,255,.3)'),
     'dark':dict(bg='#0F0E1A',solid='#1C1A2E',ink='#F3F1FF',sub='#B4AFCF',primary='#A994FF',onp='#14112B',exp='#FF8A9B',inc='#5EE0A8',a1='#3A1F4D',a2='#1E2A5A',a3='#10332A',g1='#7048F2',g2='#C2457E',g3='#B85A3E',hi='#FFFFFF',fab1='#7B5CFF',fab2='#E86FA5',fabi='#FFFFFF',bar='#FFFFFF',track='rgba(255,255,255,.3)')},
'b':{'light':dict(bg='#F1FAF8',solid='#FFFFFF',ink='#0F2A2E',sub='#4A6366',primary='#06717C',onp='#FFFFFF',exp='#C8324A',inc='#0B7A55',a1='#CFF5EC',a2='#D3ECFF',a3='#FFF6D9',g1='#7FE3D0',g2='#8FD3FF',g3='#C7E9FF',hi='#0B2A30',fab1='#087E8B',fab2='#1F6FC4',fabi='#FFFFFF',bar='#0B2A30',track='rgba(11,42,48,.15)'),
     'dark':dict(bg='#0A1618',solid='#132427',ink='#EAF8F6',sub='#A3BDBA',primary='#5FDCCB',onp='#062124',exp='#FF8A9B',inc='#7BE3B0',a1='#0F3A36',a2='#10304D',a3='#2A2A14',g1='#14695F',g2='#1D5C8C',g3='#2B4F7A',hi='#FFFFFF',fab1='#5FDCCB',fab2='#7CC4FF',fabi='#062124',bar='#FFFFFF',track='rgba(255,255,255,.25)')},
'c':{'light':dict(bg='#F6F3EA',solid='#FFFDF7',ink='#16241E',sub='#56625B',primary='#1E5A43',onp='#FFF8E6',exp='#B42D3C',inc='#1E6B3A',a1='#EFE3C2',a2='#DCE9DD',a3='#F4E6D8',g1='#0E3B2C',g2='#1E5A43',g3='#2F6B4E',hi='#FFF8E6',fab1='#1E5A43',fab2='#0E3B2C',fabi='#E9C46A',bar='#D9B45A',track='rgba(255,248,230,.22)'),
     'dark':dict(bg='#0B1310',solid='#15201B',ink='#F3EEDF',sub='#B8B29E',primary='#E0BE6A',onp='#16241E',exp='#FF8A8A',inc='#8FD6A6',a1='#2A2A12',a2='#0E2A20',a3='#2A2312',g1='#123F30',g2='#1A4D3A',g3='#0E3326',hi='#FFF8E6',fab1='#E0BE6A',fab2='#C99A3E',fabi='#16241E',bar='#E0BE6A',track='rgba(255,248,230,.18)')},
'd':{'light':dict(bg='#F3F3F0',solid='#FFFFFF',ink='#0A0A0A',sub='#52524C',primary='#0A0A0A',onp='#D4FF3A',exp='#C21F3A',inc='#0A7A3E',a1='#E9FFB0',a2='#EDEDEA',a3='#FFFFFF',g1='#D4FF3A',g2='#C6F432',g3='#B8EC2A',hi='#0A0A0A',fab1='#0A0A0A',fab2='#0A0A0A',fabi='#D4FF3A',bar='#0A0A0A',track='rgba(0,0,0,.14)'),
     'dark':dict(bg='#0A0A0A',solid='#161616',ink='#F5F5F0',sub='#A8A8A0',primary='#D4FF3A',onp='#0A0A0A',exp='#FF7A8A',inc='#7CF0A8',a1='#2A3A00',a2='#151515',a3='#101010',g1='#D4FF3A',g2='#C6F432',g3='#B8EC2A',hi='#0A0A0A',fab1='#D4FF3A',fab2='#D4FF3A',fabi='#0A0A0A',bar='#0A0A0A',track='rgba(0,0,0,.14)')},
}
def lum(h):
  c=[int(h[i:i+2],16)/255 for i in (1,3,5)];c=[x/12.92 if x<=.03928 else ((x+.055)/1.055)**2.4 for x in c];return .2126*c[0]+.7152*c[1]+.0722*c[2]
def cr(a,b):
  l=sorted([lum(a),lum(b)]);return (l[1]+.05)/(l[0]+.05)
def rgb(h):return ','.join(str(int(h[i:i+2],16)) for i in (1,3,5))
rows=[];css=[]
for k,v in P.items():
 for m in ('light','dark'):
  t=v[m];o='dark' if m=='light' else 'light';tb=v[o]['primary']
  chk={'ink/bg':cr(t['ink'],t['bg']),'sub/bg':cr(t['sub'],t['bg']),'sub/solid':cr(t['sub'],t['solid']),'exp/solid':cr(t['exp'],t['solid']),'inc/solid':cr(t['inc'],t['solid']),'exp/bg':cr(t['exp'],t['bg']),'inc/bg':cr(t['inc'],t['bg']),'primary/solid':cr(t['primary'],t['solid']),'onp/primary':cr(t['onp'],t['primary']),'hero min':min(cr(t['hi'],t[g]) for g in('g1','g2','g3')),'toastbtn/ink':cr(tb,t['ink'])}
  rows.append((k,m,chk))
  sel='.app.p-'+k+('.dark' if m=='dark' else '')
  pr=rgb(t['primary']);dk=m=='dark'
  hsh='0 1px 2px rgba(0,0,0,.35)' if t['hi'] in('#FFFFFF','#FFF8E6') else 'none'
  css.append(f"{sel}{{--bg:{t['bg']};--solid:{t['solid']};--surface:{'rgba(%s,.62)'%rgb(t['solid']) if dk else 'rgba(255,255,255,.72)'};--ink:{t['ink']};--sub:{t['sub']};--line:rgba({rgb(t['ink'])},{'.12' if dk else '.08'});--primary:{t['primary']};--onp:{t['onp']};--exp:{t['exp']};--inc:{t['inc']};--glassb:{'rgba(255,255,255,.08)' if dk else 'rgba(255,255,255,.6)'};--a1:{t['a1']};--a2:{t['a2']};--a3:{t['a3']};--h1:rgba({pr},.10);--h2:rgba({pr},.22);--h3:rgba({pr},.38);--h4:rgba({pr},.58);--g1:{t['g1']};--g2:{t['g2']};--g3:{t['g3']};--hi:{t['hi']};--hsh:{hsh};--hov:{'transparent'};--fab1:{t['fab1']};--fab2:{t['fab2']};--fabi:{t['fabi']};--bar:{t['bar']};--track:{t['track']};--tb:{tb};--glow:rgba({rgb(t['fab1'])},.40)}}")
open('palettes.css','w').write('\n'.join(css))
bad=False
for k,m,c in rows:
  fl=[f"{n} {x:.1f}" for n,x in c.items() if x<4.5]
  print(k,m,' '.join(f"{n}={x:.1f}" for n,x in c.items()),'  FAIL:'+','.join(fl) if fl else '')
json.dump({f"{k}-{m}":{n:round(x,1) for n,x in c.items()} for k,m,c in rows},open('contrast.json','w'),ensure_ascii=False,indent=0)
