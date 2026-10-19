import { test, expect } from 'vitest';
import { resolveTheme, getSavedTheme } from './theme.js';
test('저장값 우선', () => { expect(resolveTheme('light', true)).toBe('light'); expect(resolveTheme('dark', false)).toBe('dark'); });
test('저장값 없으면 시스템 설정', () => { expect(resolveTheme(null, true)).toBe('dark'); expect(resolveTheme(null, false)).toBe('light'); });
test('잘못된 저장값은 무시', () => { expect(getSavedTheme({ getItem: () => 'blue' })).toBeNull(); expect(getSavedTheme({ getItem: () => 'dark' })).toBe('dark'); });
