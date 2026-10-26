// JSON 백업(내 데이터는 내 것): 앱이 저장하는 모든 컬렉션을 담음. 서버 시각(createdAt·updatedAt·at)은 뺌
// version 3: 주식·연금(assetAccounts·holdings·contributions·assetPrefs)을 더함. 기존 키는 그대로.
// version 4: 쓰는 방식(settings)을 더함. 없으면 null. 1~3 백업은 settings 키가 없어도 읽힌다.
// version 5: 배우자 표시 이름·공동 비율·거래 owner. 4 이하 앱은 version > 자기 상한을 거절하므로
// 이름·비율을 조용히 버리지 않는다. 이 앱은 1~4도 그대로 읽는다.
import { clampStartDay } from './dates.js';
import { normalizeSettings } from './modes.js';
import { sanitizeOwnerRow } from './couple.js';

const strip = (o) => { const { createdAt, updatedAt, at, ...r } = o ?? {}; return r; };
const owned = (row) => sanitizeOwnerRow(strip(row));
export const BACKUP_VERSION = 5;
export function buildBackup({ profile = {}, categories = [], accounts = [], transactions = [], budgets = [], rules = [], recurring = [], goals = [], imports = [], assetAccounts = [], holdings = [], contributions = [], assetPrefs = null, settings = null }, now = new Date()) {
  const prefs = settings ? normalizeSettings(settings) : null;
  return {
    app: 'gagyebu', version: BACKUP_VERSION, exportedAt: now.toISOString(),
    profile: { monthStartDay: profile.monthStartDay ?? 1 },
    categories: categories.map(strip), accounts: accounts.map(strip), transactions: transactions.map(owned),
    budgets: budgets.map(strip), rules: rules.map(strip), recurring: recurring.map(owned), goals: goals.map(strip),
    imports: imports.map(strip),
    assetAccounts: assetAccounts.map(strip), holdings: holdings.map(strip), contributions: contributions.map(strip),
    assetPrefs: assetPrefs ? strip(assetPrefs) : null,
    settings: prefs && Object.keys(prefs).length ? prefs : null,
  };
}

const listOf = (raw, key) => (Array.isArray(raw?.[key]) ? raw[key].map(strip) : []);

/**
 * 백업 JSON → 복원 계획. 모르는 버전은 거절.
 * version 1~3 처럼 settings 키가 없으면 hasSettings=false (기존 설정을 지우지 않음).
 * version 3 미만이고 자산 키도 없으면 hasAssets=false (기존 주식·연금을 건드리지 않음).
 */
export function parseBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('백업 파일을 읽지 못했어요.');
  if (raw.app !== 'gagyebu') throw new Error('쨈 가계부 백업 파일이 아니에요.');
  if (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > BACKUP_VERSION) throw new Error('이 버전의 백업은 열 수 없어요.');
  const out = {
    version: raw.version,
    profile: { monthStartDay: clampStartDay(raw.profile?.monthStartDay ?? 1) },
    categories: listOf(raw, 'categories'),
    accounts: listOf(raw, 'accounts'),
    transactions: listOf(raw, 'transactions').map(sanitizeOwnerRow),
    budgets: listOf(raw, 'budgets'),
    rules: listOf(raw, 'rules'),
    recurring: listOf(raw, 'recurring').map(sanitizeOwnerRow),
    goals: listOf(raw, 'goals'),
    imports: listOf(raw, 'imports'),
    hasAssets: false,
    hasSettings: false,
    settings: null,
  };
  if (raw.version >= 3 || 'assetAccounts' in raw || 'holdings' in raw || 'contributions' in raw || 'assetPrefs' in raw) {
    out.hasAssets = true;
    out.assetAccounts = listOf(raw, 'assetAccounts');
    out.holdings = listOf(raw, 'holdings');
    out.contributions = listOf(raw, 'contributions');
    out.assetPrefs = raw.assetPrefs && typeof raw.assetPrefs === 'object' ? strip(raw.assetPrefs) : null;
  }
  if ('settings' in raw) {
    out.hasSettings = true;
    out.settings = raw.settings ? normalizeSettings(raw.settings) : null;
  }
  return out;
}
