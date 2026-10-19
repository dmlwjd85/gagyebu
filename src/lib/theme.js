// 다크 모드: 저장값(localStorage 'theme' = 'light'|'dark')이 없으면 시스템 설정을 따름.
const KEY = 'theme';
const mq = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function getSavedTheme(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}
export function resolveTheme(saved, systemDark) { return saved ?? (systemDark ? 'dark' : 'light'); }

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
export function currentTheme() { return document.documentElement.classList.contains('dark') ? 'dark' : 'light'; }

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch {}
  applyTheme(next);
  return next;
}
export function initTheme() {
  applyTheme(resolveTheme(getSavedTheme(), mq()?.matches));
  mq()?.addEventListener?.('change', (e) => { if (!getSavedTheme()) applyTheme(e.matches ? 'dark' : 'light'); });
}
export function themeMode() { return getSavedTheme() ?? 'system'; }
export function setThemeMode(mode) {
  try { mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch {}
  applyTheme(resolveTheme(getSavedTheme(), mq()?.matches));
}
