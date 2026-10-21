// Firestore 배포 계획. 프로젝트 ID는 서비스 계정 JSON의 project_id,
// 또는 저장소에 이미 있는 Firebase 설정에서만 읽는다. 없는 ID를 지어내지 않는다.
// 대상은 보안 규칙뿐이다. firestore.indexes.json 이 설정에 연결되어 있고 파일이 있을 때만 인덱스를 더한다.
import { parseServiceAccount } from './marketPrice.js';

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const INDEX_FILE = /(?:^|[/\\])firestore\.indexes\.json$/;

export function resolveFirebaseProjectId({ serviceAccountProjectId = '', configuredProjectId = '' } = {}) {
  const fromSa = String(serviceAccountProjectId ?? '').trim();
  const fromCfg = String(configuredProjectId ?? '').trim();
  if (fromSa && fromCfg && fromSa !== fromCfg) {
    throw new Error('서비스 계정 project_id 와 저장소 Firebase 설정 프로젝트가 달라 배포하지 않습니다.');
  }
  const projectId = fromSa || fromCfg;
  if (!PROJECT_ID.test(projectId)) {
    throw new Error('서비스 계정 JSON의 project_id(또는 기존 Firebase 설정)로 프로젝트를 정할 수 없어 배포하지 않습니다.');
  }
  return projectId;
}

export function firestoreDeployOnly(firebaseConfig, fileExists = () => false) {
  const rules = firebaseConfig?.firestore?.rules;
  if (typeof rules !== 'string' || !rules.trim() || !fileExists(rules)) {
    throw new Error('firebase.json 의 firestore.rules 경로를 찾을 수 없어 배포하지 않습니다.');
  }
  const targets = ['firestore:rules'];
  const indexes = firebaseConfig?.firestore?.indexes;
  if (typeof indexes === 'string' && INDEX_FILE.test(indexes) && fileExists(indexes)) {
    targets.push('firestore:indexes');
  }
  return targets.join(',');
}

export function planFirestoreRulesDeploy({
  serviceAccountRaw,
  firebaseConfig,
  configuredProjectId = '',
  fileExists = () => false,
} = {}) {
  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const projectId = resolveFirebaseProjectId({
    serviceAccountProjectId: serviceAccount.project_id,
    configuredProjectId,
  });
  const only = firestoreDeployOnly(firebaseConfig, fileExists);
  if (only !== 'firestore:rules' && only !== 'firestore:rules,firestore:indexes') {
    throw new Error('Firestore 규칙 이외는 배포하지 않습니다.');
  }
  return { projectId, only, serviceAccount };
}
