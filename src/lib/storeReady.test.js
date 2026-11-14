// 스토어 출시 준비물이 빠지거나 서로 어긋나지 않는지 본다(docs/store/README.md).
// 스토어에 적어 낸 주소(처리방침·계정 삭제 안내)가 사라지면 앱이 내려갈 수 있어서 테스트로 지킨다.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { loginView } from '../ui/views.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const CONTACT = 'dmlwjd85@gmail.com';

describe('스토어 출시 준비', () => {
  test('처리방침·계정 삭제 안내 문서가 있고 문의처·핵심 내용이 들어 있다', () => {
    const privacy = read('public/privacy.html');
    const del = read('public/delete-account.html');
    for (const html of [privacy, del]) {
      expect(html).toContain('<html lang="ko">');
      expect(html).toContain('쨈 가계부');
      expect(html).toContain(CONTACT);
    }
    expect(privacy).toContain('만 14세 이상');
    expect(privacy).toContain('모든 기록과 계정 삭제');
    expect(privacy).toContain('delete-account.html');
    expect(privacy).toMatch(/Firebase/);
    expect(del).toContain('모든 기록과 계정 삭제');
    expect(del).toContain('privacy.html');
  });

  test('로그인 화면과 설정에서 처리방침·삭제 안내로 갈 수 있다', () => {
    const card = loginView({ emulator: false, error: '' }).card;
    expect(card).toContain('href="privacy.html"');
    expect(card).toContain('만 14세 이상');
    const views = read('src/ui/views.js');
    expect(views).toMatch(/class="set-link" href="privacy\.html"/);
    expect(views).toContain('href="delete-account.html"');
    expect(views).toContain('data-action="delete-all"');
  });

  test('서비스 워커가 두 문서 주소를 앱 화면으로 바꿔 주지 않는다', async () => {
    const cfg = read('vite.config.js');
    const m = /navigateFallbackDenylist: \[(.+)\],/.exec(cfg);
    expect(m).not.toBeNull();
    const re = new RegExp(m[1].trim().slice(1, -1));
    expect(re.test('/gagyebu/privacy.html')).toBe(true);
    expect(re.test('/gagyebu/delete-account.html')).toBe(true);
    expect(re.test('/gagyebu/')).toBe(false);
    expect(re.test('/gagyebu/index.html')).toBe(false);
  });

  test('TWA 설정이 웹 앱 정보와 같고, 서명 키는 저장소에 올라가지 않는다', () => {
    const twa = JSON.parse(read('store/android/twa-manifest.json'));
    const cfg = read('vite.config.js');
    expect(twa.packageId).toBe('io.github.dmlwjd85.gagyebu');
    expect(twa.host).toBe('dmlwjd85.github.io');
    expect(twa.startUrl).toBe('/gagyebu/');
    expect(cfg).toContain(`start_url: '${twa.startUrl}'`);
    expect(cfg).toContain(`name: '${twa.name}'`);
    expect(cfg).toContain(`theme_color: '${twa.themeColor}'`);
    expect(cfg).toContain(`background_color: '${twa.backgroundColor}'`);
    for (const key of ['iconUrl', 'maskableIconUrl']) {
      const file = twa[key].replace('https://dmlwjd85.github.io/gagyebu/', 'public/');
      expect(existsSync(new URL(`../../${file}`, import.meta.url))).toBe(true);
    }
    const links = JSON.parse(read('docs/store/assetlinks.template.json'));
    expect(links[0].target.package_name).toBe(twa.packageId);
    const ignore = read('.gitignore');
    expect(ignore).toContain('*.keystore');
    expect(ignore).toContain('*.jks');
  });

  test('스토어 그림이 규격에 맞다(그래픽 1024×500, 휴대전화 9:16)', () => {
    // PNG 머리말의 가로·세로(IHDR)
    const size = (p) => { const b = readFileSync(new URL(`../../${p}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    expect(size('store/graphics/feature-1024x500.png')).toEqual([1024, 500]);
    for (const n of [1, 2]) {
      const [w, h] = size(`store/graphics/phone-${n}-1080x1920.png`);
      expect([w, h]).toEqual([1080, 1920]);
      expect(Math.max(w, h)).toBeLessThanOrEqual(2 * Math.min(w, h)); // 플레이: 긴 쪽이 짧은 쪽의 2배 이하
    }
  });
});
