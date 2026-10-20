"""QA 도구 공용: 에뮬레이터 주소·포트·프로젝트 정하기와 '내 프로젝트 데이터만' 지우기.
여러 QA 도구(또는 다른 작업자)가 같은 에뮬레이터를 동시에 써도 서로 데이터를 지우지 않도록,
기본 프로젝트 ID를 실행마다 다르게(demo-qa-<프로세스번호>) 정함. 앱에는 주소 뒤 ?emuProject=… 로 알려 줌(에뮬레이터 빌드에서만 읽음).

바꾸는 방법(환경변수 또는 인자, 인자가 우선):
  QA_EMU_HOST / --emu-host=127.0.0.1   에뮬레이터 호스트(앱 주소의 호스트와 같아야 함: localhost 또는 127.x.x.x)
  QA_AUTH_PORT / --auth-port=9099      Auth 에뮬레이터 포트
  QA_FS_PORT / --fs-port=8080          Firestore 에뮬레이터 포트
  QA_PROJECT / --project=demo-qa-123   프로젝트 ID(demo- 로 시작). 안 주면 demo-qa-<pid>
"""
import json, os, sys, urllib.request as U
from urllib.parse import urlsplit, urlunsplit, urlencode, parse_qsl

def _arg(name):
    for i, a in enumerate(list(sys.argv)):
        if a.startswith(f'--{name}='):
            sys.argv.pop(i)  # 위치 인자(URL 등)는 그대로 쓰도록 빼 둠
            return a.split('=', 1)[1]
    return None

HOST = _arg('emu-host') or os.environ.get('QA_EMU_HOST') or '127.0.0.1'
AUTH_PORT = int(_arg('auth-port') or os.environ.get('QA_AUTH_PORT') or 9099)
FS_PORT = int(_arg('fs-port') or os.environ.get('QA_FS_PORT') or 8080)
PROJECT = _arg('project') or os.environ.get('QA_PROJECT') or f'demo-qa-{os.getpid()}'
if not PROJECT.startswith('demo-'):
    sys.exit(f'[emu] 프로젝트 ID는 demo- 로 시작해야 해요(실제 프로젝트 보호): {PROJECT}')

FS_DOCS = f'http://{HOST}:{FS_PORT}/v1/projects/{PROJECT}/databases/(default)/documents'

RULES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../firestore.rules')

def load_rules():
    """에뮬레이터는 firebase.json 의 규칙을 기본 프로젝트에만 걸어 둠 → 이 실행의 프로젝트에도 같은 firestore.rules 를 걸어
    권한 오류 검사(smoke_writes 등)가 실제와 똑같이 동작하게."""
    body = json.dumps({'rules': {'files': [{'name': 'firestore.rules', 'content': open(RULES, encoding='utf-8').read()}]}}).encode()
    U.urlopen(U.Request(f'http://{HOST}:{FS_PORT}/emulator/v1/projects/{PROJECT}:securityRules', data=body, method='PUT',
                        headers={'Content-Type': 'application/json'}))

def reset():
    """이 실행의 프로젝트 데이터만 지우고 규칙을 다시 검(다른 프로젝트·다른 작업자의 데이터는 그대로)."""
    for u in [f'http://{HOST}:{FS_PORT}/emulator/v1/projects/{PROJECT}/databases/(default)/documents',
              f'http://{HOST}:{AUTH_PORT}/emulator/v1/projects/{PROJECT}/accounts']:
        U.urlopen(U.Request(u, method='DELETE'))
    load_rules()

def app_url(url):
    """앱 주소에 이 실행의 에뮬레이터 설정을 붙임(앱은 에뮬레이터 빌드일 때만 읽음)."""
    s = urlsplit(url)
    q = dict(parse_qsl(s.query))
    q.update(emuProject=PROJECT, emuHost=HOST, emuAuthPort=str(AUTH_PORT), emuFsPort=str(FS_PORT))
    return urlunsplit((s.scheme, s.netloc, s.path, urlencode(q), s.fragment))
