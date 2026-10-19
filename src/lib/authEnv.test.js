import { describe, it, expect } from 'vitest';
import { isIOS, isStandalone, isSameOriginAuth, pickLoginMode, loginErrorMessage } from './authEnv.js';

const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 };
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', maxTouchPoints: 5 };
const mac = { userAgent: ipad.userAgent, maxTouchPoints: 0 };
const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', maxTouchPoints: 5 };
const win = (standalone) => ({ matchMedia: () => ({ matches: standalone }) });
const same = { authDomain: 'dmlwjd85.github.io', host: 'dmlwjd85.github.io' };
const cross = { authDomain: 'gagyebu-b44fc2.firebaseapp.com', host: 'dmlwjd85.github.io' };

describe('로그인 방식 고르기', () => {
  it('아이폰·아이패드를 알아본다', () => {
    expect(isIOS(iphone)).toBe(true);
    expect(isIOS(ipad)).toBe(true);
    expect(isIOS(mac)).toBe(false);
    expect(isIOS(android)).toBe(false);
  });
  it('홈 화면 앱인지 알아본다', () => {
    expect(isStandalone(win(false), { standalone: true })).toBe(true);
    expect(isStandalone(win(true), {})).toBe(true);
    expect(isStandalone(win(false), {})).toBe(false);
    expect(isStandalone(undefined, {})).toBe(false);
  });
  it('같은 주소의 로그인 도우미인지 알아본다', () => {
    expect(isSameOriginAuth(same.authDomain, same.host)).toBe(true);
    expect(isSameOriginAuth(cross.authDomain, cross.host)).toBe(false);
    expect(isSameOriginAuth(undefined, 'dmlwjd85.github.io')).toBe(false);
  });
  it('아이폰 홈 화면 앱 + 같은 주소일 때만 리다이렉트', () => {
    expect(pickLoginMode({ ...same, nav: iphone, win: win(true) })).toBe('redirect');
    expect(pickLoginMode({ ...same, nav: ipad, win: win(true) })).toBe('redirect');
    expect(pickLoginMode({ ...cross, nav: iphone, win: win(true) })).toBe('popup');
    expect(pickLoginMode({ ...same, nav: iphone, win: win(false) })).toBe('popup');
    expect(pickLoginMode({ ...same, nav: android, win: win(true) })).toBe('popup');
    expect(pickLoginMode({ ...same, nav: mac, win: win(false) })).toBe('popup');
  });
  it('상황에 맞는 안내 문구', () => {
    expect(loginErrorMessage('auth/internal-error', { iosHomeApp: true, sameOrigin: false })).toMatch('Safari');
    expect(loginErrorMessage('auth/internal-error', { iosHomeApp: true, sameOrigin: true })).toBe('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(loginErrorMessage('auth/network-request-failed')).toMatch('인터넷');
    expect(loginErrorMessage('x')).toBe('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});
