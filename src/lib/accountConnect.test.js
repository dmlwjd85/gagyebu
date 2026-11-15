// 구글 계정 연결·불러오기 안내(fix/account-connect)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { syncIssue, syncBanner, accountCard, avatarHtml } from '../ui/views.js';

const user = { uid: 'u1', email: 'me@example.com', displayName: '선생님', photoURL: 'https://lh3.googleusercontent.com/a/x' };
const loaded = { user, profileLoaded: true, profileKnown: true, txLoaded: true };

describe('syncIssue: 기록을 못 불러오면 조용히 0원으로 두지 않음', () => {
  it('로그인 안 했거나 정상이면 안내 없음', () => {
    expect(syncIssue({ user: null })).toBe(null);
    expect(syncIssue(loaded)).toBe(null);
  });
  it('앱 조각 실패 > 서버 거부 > 서버 오류 순', () => {
    expect(syncIssue({ ...loaded, storeFailed: true, syncError: { code: 'permission-denied' } })).toBe('store');
    expect(syncIssue({ ...loaded, syncError: { code: 'permission-denied' } })).toBe('denied');
    expect(syncIssue({ ...loaded, syncError: { code: 'unauthenticated' } })).toBe('denied');
    expect(syncIssue({ ...loaded, syncError: { code: 'unavailable' } })).toBe('error');
  });
  it('아직 못 받음: 오프라인이면 오프라인, 오래 걸리면 slow, 그 전엔 조용히(불러오는 중 표시만)', () => {
    const waiting = { user, profileLoaded: false, txLoaded: false };
    expect(syncIssue({ user, profileLoaded: true, profileKnown: false, txLoaded: true, slow: true })).toBe('slow'); // 캐시의 '없음'만 받음
    expect(syncIssue(waiting)).toBe(null);
    expect(syncIssue(waiting, { online: false })).toBe('offline');
    expect(syncIssue({ ...waiting, slow: true })).toBe('slow');
    expect(syncIssue({ ...loaded, slow: true })).toBe(null);
  });
  it('빈 계정 안내는 다 불러온 뒤에만, 그만 보기를 누르면 숨김', () => {
    expect(syncIssue({ ...loaded, accountEmpty: true })).toBe('empty');
    expect(syncIssue({ ...loaded, accountEmpty: true }, { emptyOk: true })).toBe(null);
    expect(syncIssue({ user, profileLoaded: true, profileKnown: true, txLoaded: false, accountEmpty: true })).toBe(null);
  });
});

describe('안내 띠·계정 카드', () => {
  it('못 불러오면 다시 불러오기와 계정 다시 연결 단추, 연결된 계정 이메일', () => {
    const h = syncBanner({ sync: 'denied', user });
    expect(h).toContain('data-action="reload-data"');
    expect(h).toContain('data-action="switch-account"');
    expect(h).toContain('me@example.com');
    expect(h).toContain('role="alert"');
    expect(h).toContain('기록은 지워지지 않았어요');
  });
  it('오프라인이면 다시 불러오기만', () => {
    const h = syncBanner({ sync: 'offline', user });
    expect(h).toContain('reload-data');
    expect(h).not.toContain('switch-account');
  });
  it('빈 계정: 다른 구글 계정으로 연결할까요?', () => {
    const h = syncBanner({ sync: 'empty', user });
    expect(h).toContain('이 계정엔 기록이 없어요');
    expect(h).toContain('다른 구글 계정으로 연결할까요?');
    expect(h).toContain('data-action="empty-ok"');
  });
  it('안내 없으면 빈 글자', () => expect(syncBanner({ sync: null, user })).toBe(''));
  it('설정 계정 카드: 사진·이름·이메일·다른 계정 연결·로그아웃', () => {
    const h = accountCard({ user });
    expect(h).toContain('연결된 구글 계정');
    expect(h).toContain('referrerpolicy="no-referrer"');
    expect(h).toContain('me@example.com');
    expect(h).toContain('data-action="switch-account"');
    expect(h).toContain('data-action="logout"');
  });
  it('사진 주소가 https가 아니면 그림 없이 첫 글자만, 글자는 이스케이프', () => {
    const h = avatarHtml({ displayName: '<b>', photoURL: 'javascript:alert(1)' });
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;');
  });
});

describe('store.js: 모든 구독에 실패 처리', () => {
  const src = readFileSync(new URL('../store.js', import.meta.url), 'utf8');
  it('onSnapshot 은 watch() 한 곳에서만, 오류 처리기와 함께', () => {
    expect(src.match(/onSnapshot\(/g)).toHaveLength(1);
    expect(src).toMatch(/return onSnapshot\(ref, opts, \(snap\) => \{[\s\S]*?\}, onFail\(where\)\)/);
  });
  it('빈 계정 확인은 읽기 1건만(쓰기 없음)', () => {
    const fn = src.slice(src.indexOf('async function checkEmpty'), src.indexOf('// 반복 거래: 오늘까지'));
    expect(fn).toContain('limit(1)');
    expect(fn).not.toMatch(/setDoc|updateDoc|deleteDoc|writeBatch/);
  });
});

describe('data.js: 앱 조각 실패를 숨기지 않음', () => {
  const src = readFileSync(new URL('../data.js', import.meta.url), 'utf8');
  it('실패하면 storeFailed 표시, 다음에 다시 받을 수 있게 비움', () => {
    expect(src).toContain('storeFailed: failed');
    expect(src).toMatch(/catch\(\(e\) => \{ storeP = null; throw e; \}\)/);
  });
  it('localStorage 키 signedIn 그대로', () => expect(src).toContain("const SIGNED_IN = 'signedIn'"));
});
