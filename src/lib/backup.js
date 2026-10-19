// JSON 백업(내 데이터는 내 것): 앱이 저장하는 모든 컬렉션을 담음. 서버 시각(createdAt·updatedAt·at)은 뺌
const strip = (o) => { const { createdAt, updatedAt, at, ...r } = o ?? {}; return r; };
export const BACKUP_VERSION = 2;
export function buildBackup({ profile = {}, categories = [], accounts = [], transactions = [], budgets = [], rules = [], recurring = [], goals = [], imports = [] }, now = new Date()) {
  return {
    app: 'gagyebu', version: BACKUP_VERSION, exportedAt: now.toISOString(),
    profile: { monthStartDay: profile.monthStartDay ?? 1 },
    categories: categories.map(strip), accounts: accounts.map(strip), transactions: transactions.map(strip),
    budgets: budgets.map(strip), rules: rules.map(strip), recurring: recurring.map(strip), goals: goals.map(strip),
    imports: imports.map(strip),
  };
}
