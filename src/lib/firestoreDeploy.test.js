import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { firestoreDeployOnly, planFirestoreRulesDeploy, resolveFirebaseProjectId } from './firestoreDeploy.js';

const RULES = 'firestore.rules';
const secret = 'super-secret-private-key-value';

function account(projectId = 'gagyebu-prod1') {
  return JSON.stringify({ project_id: projectId, client_email: 'ci@example.iam.gserviceaccount.com', private_key: secret });
}

const firebaseConfig = { firestore: { rules: RULES } };
const existsRules = (path) => path === RULES;

describe('Firestore 규칙 배포 계획', () => {
  test('프로젝트 ID는 서비스 계정 project_id 에서 읽는다', () => {
    const plan = planFirestoreRulesDeploy({
      serviceAccountRaw: account('demo-teacher'),
      firebaseConfig,
      fileExists: existsRules,
    });
    expect(plan.projectId).toBe('demo-teacher');
    expect(plan.only).toBe('firestore:rules');
    expect(plan.serviceAccount.private_key).toBe(secret);
  });

  test('base64 시크릿도 같은 서비스 계정으로 읽는다', () => {
    const raw = Buffer.from(account('household-book')).toString('base64');
    const plan = planFirestoreRulesDeploy({
      serviceAccountRaw: raw,
      firebaseConfig,
      fileExists: existsRules,
    });
    expect(plan.projectId).toBe('household-book');
  });

  test('기존 설정과 서비스 계정 프로젝트가 같으면 그 ID를 쓴다', () => {
    expect(resolveFirebaseProjectId({
      serviceAccountProjectId: 'household-book',
      configuredProjectId: 'household-book',
    })).toBe('household-book');
  });

  test('설정만 있고 형식에 맞으면 그 프로젝트를 쓴다', () => {
    expect(resolveFirebaseProjectId({ configuredProjectId: 'household-book' })).toBe('household-book');
  });

  test('두 프로젝트가 다르거나 ID를 정할 수 없으면 추측하지 않는다', () => {
    expect(() => resolveFirebaseProjectId({
      serviceAccountProjectId: 'household-book',
      configuredProjectId: 'other-project',
    })).toThrow(/달라/);
    expect(() => resolveFirebaseProjectId({})).toThrow(/정할 수 없어/);
    expect(() => planFirestoreRulesDeploy({
      serviceAccountRaw: account('NOT-A-PROJECT'),
      firebaseConfig,
      fileExists: existsRules,
    })).toThrow(/정할 수 없어/);
    try {
      planFirestoreRulesDeploy({
        serviceAccountRaw: account('NOT-A-PROJECT'),
        firebaseConfig,
        fileExists: existsRules,
      });
    } catch (e) {
      expect(e.message).not.toContain(secret);
      expect(e.message).not.toContain('NOT-A-PROJECT');
    }
  });

  test('인덱스가 연결돼 있고 파일이 있을 때만 인덱스 대상을 더한다', () => {
    const withIndexes = { firestore: { rules: RULES, indexes: 'firestore.indexes.json' } };
    expect(firestoreDeployOnly(withIndexes, existsRules)).toBe('firestore:rules');
    expect(firestoreDeployOnly(withIndexes, (path) => path === RULES || path === 'firestore.indexes.json'))
      .toBe('firestore:rules,firestore:indexes');
    expect(firestoreDeployOnly({ firestore: { rules: RULES, indexes: 'other.json' } }, () => true))
      .toBe('firestore:rules');
  });

  test('규칙 파일이 없으면 배포 대상을 만들지 않는다', () => {
    expect(() => firestoreDeployOnly(firebaseConfig, () => false)).toThrow(/firestore\.rules/);
    expect(firestoreDeployOnly(firebaseConfig, existsRules)).not.toMatch(/hosting|functions|storage|database|(^|,)firestore(,|$)/);
  });

  test('저장소 firebase.json 은 규칙 파일만 가리킨다', () => {
    const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
    expect(cfg.firestore.rules).toBe('firestore.rules');
    expect(cfg.firestore.indexes).toBeUndefined();
    expect(firestoreDeployOnly(cfg, existsRules)).toBe('firestore:rules');
  });
});

describe('Pages 워크플로', () => {
  test('테스트 통과 후 규칙만 배포하고, 시크릿이 없으면 경고 후 사이트를 계속 배포한다', () => {
    const yml = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
    const testAt = yml.indexOf('run: npm test');
    const rulesTestAt = yml.indexOf('run: npm run test:rules');
    const credsAt = yml.indexOf('GOOGLE_APPLICATION_CREDENTIALS');
    const deployAt = yml.indexOf('npx --no-install firebase-tools deploy --only "$ONLY" --project "$PROJECT_ID" --non-interactive');
    const pagesAt = yml.indexOf('actions/deploy-pages@v4');
    expect(testAt).toBeGreaterThan(-1);
    expect(rulesTestAt).toBeGreaterThan(testAt);
    expect(credsAt).toBeGreaterThan(rulesTestAt);
    expect(deployAt).toBeGreaterThan(credsAt);
    expect(pagesAt).toBeGreaterThan(deployAt);
    expect(yml).toContain('::warning::');
    expect(yml).toContain('FIREBASE_SERVICE_ACCOUNT');
    expect(yml).toContain('firestore:rules,firestore:indexes');
    expect(yml).not.toMatch(/--project\s+["']?[a-z][a-z0-9-]{4,28}[a-z0-9]["']?/);
    expect(yml).not.toContain('demo-gagyebu');
  });
});
