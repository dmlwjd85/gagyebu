"""모든 화면 가로 넘침(가로 스크롤) 자동 검사 — QA N3 재발 방지.
사용: python3 tools/qa/overflow.py [URL] [사진 접두어]
 - 에뮬레이터 빌드(VITE_USE_EMULATOR=true) 미리보기 주소. 기본 http://127.0.0.1:4174/gagyebu/
 - 데모 데이터 + 아주 긴 이름(목표·반복·카테고리·결제수단·메모)을 넣고
   360·1280px × 라이트·다크로 모든 화면(+가져오기 단계·입력 시트)을 열어
   document 가로 스크롤(scrollWidth - clientWidth)과 화면 밖으로 나간 요소를 잼. 하나라도 있으면 종료 코드 1
"""
import sys, json, urllib.request as U
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/gagyebu/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
SAMPLE = 'samples/현대카드_실제형식_예시.xlsx'
for u in ['http://127.0.0.1:8080/emulator/v1/projects/demo-gagyebu/databases/(default)/documents', 'http://127.0.0.1:9099/emulator/v1/projects/demo-gagyebu/accounts']:
    U.urlopen(U.Request(u, method='DELETE'))
LONG = '비상금 모으기 프로젝트 이름이 아주 긴 경우 삼십자'
MEASURE = """() => {
  const de = document.documentElement, W = de.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= W + 0.5) continue;
    // 가로 스크롤 상자(표 등) 안에 있으면 그 상자 안에서 넘는 것이라 괜찮음
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.getBoundingClientRect().right <= W + 0.5) { clipped = true; break; } p = p.parentElement; }
    if (!clipped) bad.push((el.className && typeof el.className === 'string' ? el.className.slice(0, 40) : el.tagName) + ' right=' + Math.round(r.right));
  }
  return { over: de.scrollWidth - de.clientWidth, bad: bad.slice(0, 5) };
}"""
fails = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--lang=ko-KR'])
    ctx = b.new_context(viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul')
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_timeout(1500)
    pg.click('text=테스트 계정으로 로그인'); pg.wait_for_timeout(2000)
    pg.evaluate('window.__gagyebu.seedDemo()'); pg.wait_for_timeout(2500)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.evaluate(f"""(() => {{ const g = window.__gagyebu, d = g.data, t = g.state.txs[0]?.date || '2026-10-10';
      d.saveGoal({{ name: '{LONG}', emoji: '🛟', target: 3000000, saved: 2100000, order: 0 }});
      d.saveGoal({{ name: 'Supercalifragilisticexpialidocious', emoji: '✈️', target: 1200000, saved: 10, order: 1 }});
      d.saveRecurring({{ name: '넷플릭스 프리미엄 가족 요금제 4인 공유', amount: 17000, kind: 'expense', categoryId: 'telecom', dayOfMonth: 31, active: true, startYm: '2026-10', lastPosted: '2026-10' }});
      d.saveCategory({{ name: '아주아주긴카테고리이름스무자까지', emoji: '🧪', kind: 'expense', order: 99 }});
      d.saveAccount({{ name: '아주아주긴결제수단이름스무자까지요', emoji: '💳', type: 'card', order: 9 }});
      d.saveTx({{ date: t, amount: 123456789, kind: 'expense', categoryId: 'etc', memo: 'Averyveryverylongmerchantnamewithoutanyspaces_LLC_Korea_Branch #아주긴태그이름도있어요' }});
      d.saveTx({{ date: t, amount: -40000, kind: 'expense', categoryId: 'fashion', memo: '무신사 반품', importHash: '0123456789abcdef' }});
      // QA 3차 N13: 공백 없는 최대 길이 이름(결제수단·카테고리 20자, 목표·반복 30자, 규칙 40자, 메모 100자+태그 20자)
      d.saveAccount({{ name: '{'결' * 20}', emoji: '💳', type: 'card', order: 10 }});
      d.saveCategory({{ name: '{'카' * 20}', emoji: '🧪', kind: 'expense', order: 100 }});
      d.saveCategory({{ name: '{'M' * 20}', emoji: '🧪', kind: 'income', order: 100 }});
      d.saveGoal({{ name: '{'가' * 30}', emoji: '🛟', target: 9999999999, saved: 123456789, order: 2 }});
      d.saveGoal({{ name: '{'W' * 30}', emoji: '✈️', target: 1000, saved: 999, order: 3 }});
      d.saveRecurring({{ name: '{'가' * 30}', amount: 999999999, kind: 'expense', categoryId: 'telecom', dayOfMonth: 31, active: true, startYm: '2026-10', lastPosted: '2026-10' }});
      d.saveRule({{ match: '{'X' * 40}', categoryId: 'cafe' }}); d.saveRule({{ match: '{'긴' * 40}', categoryId: 'food' }});
      d.saveTx({{ date: t, amount: 5000, kind: 'expense', categoryId: 'etc', memo: '{'메' * 100} #{'태' * 20}' }});
      // QA 3차 N10·N12: 환불이 지출보다 많은 달·환불만 있는 달(6개월 전)
      const ym = (k) => {{ const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - k); return `${{x.getFullYear()}}-${{String(x.getMonth() + 1).padStart(2, '0')}}`; }};
      d.saveTx({{ date: ym(5) + '-02', amount: -9876543, kind: 'expense', categoryId: 'living', memo: '환불', importHash: '0123456789abcde3' }});
      d.saveTx({{ date: ym(8) + '-03', amount: -1234567, kind: 'expense', categoryId: 'fashion', memo: '환불', importHash: '0123456789abcde1' }});
      d.saveTx({{ date: ym(8) + '-04', amount: -45000, kind: 'expense', categoryId: 'health', memo: '환불', importHash: '0123456789abcde2' }});
    }})()""")
    pg.wait_for_timeout(1500)
    G = lambda v: pg.evaluate(f"window.__gagyebu.go('{v}')") or pg.wait_for_timeout(500)
    for w in (360, 1280):
        pg.set_viewport_size({'width': w, 'height': 800})
        for theme in ('light', 'dark'):
            pg.evaluate(f"localStorage.setItem('theme','{theme}'); document.documentElement.classList.toggle('dark', {str(theme == 'dark').lower()})")
            pg.evaluate("window.__gagyebu.ui.envelopes = true")
            checks = []
            for v in ['home', 'calendar', 'chart', 'budget', 'settings', 'search', 'recurring', 'import']:
                G(v)
                if v == 'calendar':
                    checks.append(('calendar', pg.evaluate(MEASURE)))
                    pg.evaluate("window.__gagyebu.ui.mode='list'; window.__gagyebu.render()"); pg.wait_for_timeout(300); v = 'calendar-list'
                if v == 'search':
                    pg.fill('[data-search-q]', 'a'); pg.wait_for_timeout(600)
                checks.append((v, pg.evaluate(MEASURE)))
                if SHOT and v in ('chart', 'budget'): pg.screenshot(path=f'{SHOT}{v}-{w}-{theme}.png', full_page=True)
            pg.set_input_files('[data-imp-file]', SAMPLE); pg.wait_for_timeout(1500); checks.append(('import2', pg.evaluate(MEASURE)))
            pg.click('[data-imp-next]'); pg.wait_for_timeout(1200); checks.append(('import3', pg.evaluate(MEASURE)))
            pg.click('[data-imp-next]'); pg.wait_for_timeout(400); checks.append(('import4', pg.evaluate(MEASURE)))
            # 환불이 지출보다 많은 달(5달 전)·환불만 있는 달(8달 전): 홈·차트(지출·남긴 돈)·예산·달력
            for k, tag in ((5, 'refundover'), (8, 'refundonly')):
                pg.evaluate(f"(() => {{ const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - {k}); window.__gagyebu.ui.viewYm = `${{x.getFullYear()}}-${{String(x.getMonth() + 1).padStart(2, '0')}}`; window.__gagyebu.render(); }})()"); pg.wait_for_timeout(1500)
                for v in ['home', 'chart', 'budget', 'calendar']:
                    G(v); checks.append((f'{tag}-{v}', pg.evaluate(MEASURE)))
                    if SHOT and v in ('home', 'chart') and w == 360: pg.screenshot(path=f'{SHOT}{tag}-{v}-{w}-{theme}.png', full_page=True)
                pg.evaluate("window.__gagyebu.ui.chartKind = 'saved'"); G('chart'); checks.append((f'{tag}-saved', pg.evaluate(MEASURE)))
                pg.evaluate("window.__gagyebu.ui.chartKind = 'expense'")
            pg.evaluate("window.__gagyebu.ui.chartKind = 'expense'; window.__gagyebu.ui.viewYm = null"); G('home')
            G('home'); pg.evaluate("window.__gagyebu.openSheet(window.__gagyebu.state.txs.find(t => t.amount === 123456789))"); pg.wait_for_timeout(500)
            checks.append(('sheet', pg.evaluate(MEASURE))); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            for name, r in checks:
                ok = r['over'] == 0 and not r['bad']
                print(f"{'OK ' if ok else 'NG '} {w}px {theme:5} {name:14} 가로 넘침 {r['over']}px {'' if ok else r['bad']}", flush=True)
                if not ok: fails.append((w, theme, name, r))
    b.close()
print('결과:', '모두 0' if not fails else f'{len(fails)}곳 넘침')
sys.exit(1 if fails else 0)
