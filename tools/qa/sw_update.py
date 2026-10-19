#!/usr/bin/env python3
"""새 버전 적용 검사(QA 3차 N3): 실제 빌드(vite preview)에서 서비스 워커가 새 버전으로 바뀌는 데 몇 번이 드는지.
준비: 에뮬레이터 + 빌드 세 개(모두 VITE_USE_EMULATOR=true)
  OLD = 수정 전 빌드(예: c36c512, 지금 배포본과 같은 서비스 워커 설정), V1·V2 = 이 브랜치 빌드(VITE_BUILD_TAG=v1/v2로 구분)
  ROOT = vite preview --outDir 로 띄운 폴더(이 검사가 내용을 바꿔치기함)
사용: python3 tools/qa/sw_update.py 주소 ROOT OLD V1 V2 [사진 접두사]
경우
 A) OLD → V1 배포: 새로 고침 1·2·3번째 버전, 앱을 닫았다 다시 열기 1·2번째 버전
 B) V1 → V2 배포, 입력 중 아님: 새로 고침 한 번(자동으로 한 번 더 불러옴) 뒤 버전
 C) V1 → V2 배포, 켜 둔 지 오래 + 입력 시트에 금액 입력 중: 다시 불러오지 않고 안내만 → 시트를 닫으면 '새 버전이 있어요 [지금 적용]' → 누르면 V2
 D) V1에서 권한 거부 토스트가 뜬 뒤 V2 배포: 토스트의 [새로 고침] 한 번으로 V2
"""
import json, os, shutil, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import emu  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

URL = emu.app_url(sys.argv[1]); ROOT, OLD, V1, V2 = sys.argv[2:6]
SHOT = sys.argv[6] if len(sys.argv) > 6 else '/tmp/gagyebu-sw-'
VER = "(()=>document.documentElement.dataset.build||([...document.scripts].map(s=>s.src).join(' ').match(/index-[^.]+\\.js/)||['?'])[0])()"
REG = "navigator.serviceWorker.getRegistration().then(r=>r?{active:!!r.active,waiting:!!r.waiting,installing:!!r.installing}:null)"
def swap(d):  # ROOT 내용을 d로 바꿈(폴더 자체는 그대로 둬야 vite preview가 계속 보여 줌)
    for n in os.listdir(ROOT):
        x = os.path.join(ROOT, n); shutil.rmtree(x) if os.path.isdir(x) and not os.path.islink(x) else os.remove(x)
    shutil.copytree(d, ROOT, dirs_exist_ok=True)
def ctx(p, prof): return p.chromium.launch_persistent_context(prof, viewport={'width': 360, 'height': 780}, locale='ko-KR', timezone_id='Asia/Seoul')
def login(pg):
    pg.wait_for_function("document.body.innerText.includes('테스트 계정으로 로그인') || (window.__gagyebu && window.__gagyebu.state.user)", timeout=30000)
    if pg.locator('text=테스트 계정으로 로그인').count(): pg.click('text=테스트 계정으로 로그인')
    pg.wait_for_function('window.__gagyebu && window.__gagyebu.state.user && window.__gagyebu.state.categories.length>0', timeout=30000)
R = {}
emu.reset()
with sync_playwright() as p:
    # A
    prof = tempfile.mkdtemp(); swap(OLD); c = ctx(p, prof); pg = c.new_page()
    pg.goto(URL); pg.wait_for_timeout(5000); pg.reload(); pg.wait_for_timeout(3000)
    A = {'설치 뒤': pg.evaluate(VER)}
    swap(V1)
    for i in (1, 2, 3):
        pg.reload(); pg.wait_for_timeout(8000); A[f'배포 뒤 새로 고침 {i}번째'] = pg.evaluate(VER)
    c.close()
    prof = tempfile.mkdtemp(); swap(OLD); c = ctx(p, prof); pg = c.new_page(); pg.goto(URL); pg.wait_for_timeout(5000); c.close()
    swap(V1)
    for i in (1, 2):
        c = ctx(p, prof); pg = c.new_page(); pg.goto(URL); pg.wait_for_timeout(8000); A[f'배포 뒤 앱 다시 열기 {i}번째'] = pg.evaluate(VER); c.close()
    R['A_OLD→V1'] = A; print('A', A, flush=True)
    # B
    prof = tempfile.mkdtemp(); swap(V1); c = ctx(p, prof); pg = c.new_page()
    pg.goto(URL); pg.wait_for_timeout(5000); pg.reload(); pg.wait_for_timeout(3000)
    B = {'설치 뒤': pg.evaluate(VER)}
    swap(V2); pg.reload(); pg.wait_for_timeout(10000)
    B['배포 뒤 새로 고침 한 번(10초 뒤)'] = pg.evaluate(VER); B['서비스 워커'] = pg.evaluate(REG)
    c.close(); R['B_V1→V2_한가함'] = B; print('B', B, flush=True)
    # C
    prof = tempfile.mkdtemp(); swap(V1); c = ctx(p, prof); pg = c.new_page()
    pg.goto(URL); pg.wait_for_timeout(4000); pg.reload(); login(pg)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.wait_for_timeout(16000)  # 켜 둔 지 15초 넘음
    pg.click('[data-action="add"]'); pg.wait_for_timeout(600)
    for k in '12300': pg.click(f'.key[data-key="{k}"]')
    swap(V2); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(9000)
    C = {'입력 중 배포 뒤 버전': pg.evaluate(VER), '안내 상태': pg.evaluate('window.__gagyebu.ui.updateReady===true'),
         '입력한 금액 그대로': pg.evaluate("document.querySelector('#sheet-root')?.innerText.includes('12,300')")}
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    if pg.locator('[role=alertdialog] [data-v="1"]').count(): pg.click('[role=alertdialog] [data-v="1"]'); pg.wait_for_timeout(500)
    pg.evaluate("window.__gagyebu.go('home')"); pg.wait_for_timeout(800)
    C['안내 줄'] = pg.inner_text('.update-bar') if pg.locator('.update-bar').count() else None
    C['안내 줄 버튼 높이'] = pg.evaluate("document.querySelector('.update-btn')?.getBoundingClientRect().height")
    C['가로 넘침'] = pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
    for theme in ('light', 'dark'):
        pg.evaluate(f"localStorage.setItem('theme','{theme}'); document.documentElement.classList.toggle('dark', {str(theme == 'dark').lower()})"); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{SHOT}update-bar-360-{theme}.png')
    pg.click('[data-action="apply-update"]'); pg.wait_for_timeout(6000)
    C['[지금 적용] 뒤 버전'] = pg.evaluate(VER)
    c.close(); R['C_V1→V2_입력중'] = C
    # D
    prof = tempfile.mkdtemp(); swap(V1); c = ctx(p, prof); pg = c.new_page()
    pg.goto(URL); pg.wait_for_timeout(4000); pg.reload(); login(pg)
    pg.evaluate("localStorage.setItem('tips', JSON.stringify({v:2,queue:[],hiddenOn:'2099-01-01',dismiss:{},excluded:[]}))")
    pg.wait_for_timeout(16000)
    deny = os.path.join(tempfile.mkdtemp(), 'deny.rules'); open(deny, 'w').write("rules_version = '2';\nservice cloud.firestore { match /databases/{d}/documents { match /{p=**} { allow read: if request.auth != null; } } }\n")
    emu.load_rules(deny)
    pg.click('[data-action="add"]'); pg.wait_for_timeout(600)
    for k in '4500': pg.click(f'.key[data-key="{k}"]')
    if pg.locator('[data-cat="food"]').count(): pg.click('[data-cat="food"]')
    pg.click('[data-save]'); pg.wait_for_timeout(4000)
    D = {'토스트': pg.inner_text('#toast') if pg.locator('#toast.show').count() else None}
    for theme in ('light', 'dark'):
        pg.evaluate(f"localStorage.setItem('theme','{theme}'); document.documentElement.classList.toggle('dark', {str(theme == 'dark').lower()})"); pg.wait_for_timeout(200)
        pg.screenshot(path=f'{SHOT}denied-toast-360-{theme}.png')
    emu.load_rules()
    swap(V2)
    if pg.locator('#toast.show .toast-btn').count(): pg.click('#toast.show .toast-btn')
    pg.wait_for_timeout(9000)
    D['[새로 고침] 한 번 뒤 버전'] = pg.evaluate(VER)
    c.close(); R['D_권한토스트_새로고침'] = D
print(json.dumps(R, ensure_ascii=False, indent=1))
ok = {
    'A 새로 고침 두 번째에는 새 버전': R['A_OLD→V1']['배포 뒤 새로 고침 2번째'] == 'v1',
    'B 새로 고침 한 번으로 새 버전': R['B_V1→V2_한가함']['배포 뒤 새로 고침 한 번(10초 뒤)'] == 'v2',
    'C 입력 중엔 그대로·안내': R['C_V1→V2_입력중']['입력 중 배포 뒤 버전'] == 'v1' and R['C_V1→V2_입력중']['안내 상태'],
    'C [지금 적용]으로 새 버전': R['C_V1→V2_입력중']['[지금 적용] 뒤 버전'] == 'v2',
    'D [새로 고침] 한 번으로 새 버전': R['D_권한토스트_새로고침']['[새로 고침] 한 번 뒤 버전'] == 'v2',
}
print('결과:', {k: ('통과' if v else '실패') for k, v in ok.items()})
sys.exit(0 if all(ok.values()) else 1)
