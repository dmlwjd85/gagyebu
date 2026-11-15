import { describe, expect, test } from 'vitest';
import { UPDATE_NOTICE_TEXT, shouldOfferUpdate, updateNoticeSeen, markUpdateNotice } from './pwaUpdate.js';

describe('새 버전 안내', () => {
  test('이미 켜 둔 앱에 새 워커가 있을 때만', () => {
    expect(shouldOfferUpdate({ hadController: true, updateReady: true })).toBe(true);
    expect(shouldOfferUpdate({ hadController: false, updateReady: true })).toBe(false);
    expect(shouldOfferUpdate({ hadController: true, updateReady: false })).toBe(false);
  });
  test('문구는 한 세션에 한 번만 기억한다', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    expect(updateNoticeSeen(storage)).toBe(false);
    expect(UPDATE_NOTICE_TEXT).toBe('새 버전으로 업데이트해 주세요');
    markUpdateNotice(storage);
    expect(updateNoticeSeen(storage)).toBe(true);
  });
});
