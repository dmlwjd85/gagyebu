// 실제 카드·은행 문자 형식을 가짜 번호·이름으로 재구성한 피스처.
// 근거: 신한 한 줄(함쓰가계부/GG.Lab 공개 예시), 현대 여러 줄·신한은행 출금(시그널 가계부 안내),
// KB국민은행 입출금(KB 입출금내역 자동통지 SMS 예시). 나머지는 같은 계열 카드사의 흔한 승인·취소·할부 배열.

export const NOW = new Date(2026, 9, 20, 15, 0, 0); // 2026-10-20

export const SMS_FIXTURES = [
  {
    id: 'shinhan-approval',
    text: '[Web발신]\n신한카드(1101)승인 김*별 72,490원(일시불)10/18 09:12 (주)이마트 누적120,190원',
    expect: { issuer: '신한카드', channel: 'card', status: 'approval', amount: 72490, kind: 'expense', date: '2026-10-18', time: '09:12', merchant: '이마트', card4: '1101', installment: null },
  },
  {
    id: 'shinhan-cancel',
    text: '신한카드(1101)취소 김*별 72,490원(일시불)10/18 11:40 (주)이마트',
    expect: { issuer: '신한카드', status: 'cancel', amount: 72490, signedAmount: -72490, kind: 'expense', date: '2026-10-18', time: '11:40', merchant: '이마트', card4: '1101' },
  },
  {
    id: 'samsung-multiline',
    text: '삼성1234 승인\n이*라\n12,300원 일시불\n10/05 13:22\n스타벅스 강남R점',
    expect: { issuer: '삼성카드', status: 'approval', amount: 12300, date: '2026-10-05', time: '13:22', merchant: '스타벅스 강남R점', card4: '1234', installment: null },
  },
  {
    id: 'samsung-partial',
    text: '삼성카드 부분취소 이*라 5,000원 10/21 19:02 쿠팡',
    expect: { issuer: '삼성카드', status: 'partial-cancel', amount: 5000, signedAmount: -5000, kind: 'expense', date: '2026-10-21', time: '19:02', merchant: '쿠팡' },
  },
  {
    id: 'kb-card',
    text: '[KB국민카드] 박*서님 10/02 18:44 28,000원 일시불 배달의민족 승인',
    expect: { issuer: 'KB국민카드', status: 'approval', amount: 28000, date: '2026-10-02', time: '18:44', merchant: '배달의민족' },
  },
  {
    id: 'hyundai-multiline',
    // 시그널 안내와 같은 줄 배치. 기준일이 10월이면 12/17은 작년으로 읽는다.
    text: '현대카드 체크승인\n김*플\n35,000원 일시불\n12/17 13:00\n쿠팡',
    expect: { issuer: '현대카드', status: 'approval', amount: 35000, date: '2025-12-17', time: '13:00', merchant: '쿠팡', installment: null, channel: 'card' },
  },
  {
    id: 'hyundai-installment',
    text: '현대카드 승인\n박*민\n360,000원 3개월\n10/19 15:48\n무신사',
    expect: { issuer: '현대카드', status: 'approval', amount: 360000, date: '2026-10-19', time: '15:48', merchant: '무신사', installment: 3 },
  },
  {
    id: 'lotte',
    text: '롯데카드(3303) 승인\n한*결\n19,800원 2개월\n10/05 17:44\n교보문고',
    expect: { issuer: '롯데카드', status: 'approval', amount: 19800, card4: '3303', installment: 2, merchant: '교보문고', date: '2026-10-05', time: '17:44' },
  },
  {
    id: 'hana',
    text: '하나1234승인 윤*재 42,000원 일시불 10/02 11:03 배달의민족',
    expect: { issuer: '하나카드', status: 'approval', amount: 42000, card4: '1234', merchant: '배달의민족', date: '2026-10-02', time: '11:03' },
  },
  {
    id: 'woori-card',
    text: '우리카드 승인\n정*호\n15,500원\n일시불\n09/30 21:18\nGS25 역삼점',
    expect: { issuer: '우리카드', status: 'approval', amount: 15500, merchant: 'GS25 역삼점', date: '2026-09-30', time: '21:18', installment: null },
  },
  {
    id: 'nh-card',
    text: 'NH농협카드(2202)승인 최*아 8,900원 일시불 10/11 18:05 올리브영',
    expect: { issuer: 'NH농협카드', status: 'approval', amount: 8900, card4: '2202', merchant: '올리브영', date: '2026-10-11', time: '18:05' },
  },
  {
    id: 'bc',
    text: '[BC카드] 10/12 12:11 승인 23,400원(일시불) 메가박스 강남',
    expect: { issuer: 'BC카드', status: 'approval', amount: 23400, merchant: '메가박스 강남', date: '2026-10-12', time: '12:11', installment: null },
  },
  {
    id: 'kakaobank-card',
    text: '[카카오뱅크]\n체크카드 승인\n10/20 14:32\n12,500원\n스타벅스',
    expect: { issuer: '카카오뱅크', channel: 'card', status: 'approval', amount: 12500, merchant: '스타벅스', date: '2026-10-20', time: '14:32' },
  },
  {
    id: 'kakaobank-spend',
    text: '[카카오뱅크] 스타벅스 강남R점에서 12,500원을 썼어요.',
    expect: { issuer: '카카오뱅크', channel: 'card', status: 'approval', amount: 12500, merchant: '스타벅스 강남R점', dateInferred: true, date: '2026-10-20' },
  },
  {
    id: 'kakaobank-deposit',
    text: '[카카오뱅크] 김*수님이 50,000원을 보냈어요.',
    expect: { issuer: '카카오뱅크', channel: 'bank', status: 'deposit', kind: 'income', amount: 50000, signedAmount: 50000, merchant: '김*수', dateInferred: true },
  },
  {
    id: 'toss-card',
    text: '[토스뱅크] 10/08 20:15\n체크카드 승인\n9,700원\n이디야 합정점',
    expect: { issuer: '토스뱅크', channel: 'card', status: 'approval', amount: 9700, merchant: '이디야 합정점', date: '2026-10-08', time: '20:15' },
  },
  {
    id: 'toss-send',
    text: '[토스뱅크] 홍*길님에게 20,000원을 보냈어요.',
    expect: { issuer: '토스뱅크', channel: 'bank', status: 'withdrawal', kind: 'expense', amount: 20000, merchant: '홍*길' },
  },
  {
    id: 'kb-bank-in',
    // KB 공식 예시 배열. 계좌·이름은 가짜.
    text: '[KB]10/20 16:40 498125****8895 박*서 50,000 입금 잔액 1,200,000 1644-9999',
    expect: { issuer: 'KB국민은행', channel: 'bank', status: 'deposit', kind: 'income', amount: 50000, date: '2026-10-20', time: '16:40', merchant: '박*서', card4: null },
  },
  {
    id: 'kb-bank-out',
    text: '[KB]10/07 15:22 498125****8895 홍길동 인터넷출금10,000 잔액 50,000 1644-9999',
    expect: { issuer: 'KB국민은행', channel: 'bank', status: 'withdrawal', kind: 'expense', amount: 10000, merchant: '홍길동', date: '2026-10-07', time: '15:22' },
  },
  {
    id: 'shinhan-bank',
    // 시그널 안내와 같은 줄 배치.
    text: '신한10/17 13:00\n110-***-******\n출금 35,000원\n잔액 0원\n쿠팡',
    expect: { issuer: '신한은행', channel: 'bank', status: 'withdrawal', amount: 35000, merchant: '쿠팡', date: '2026-10-17', time: '13:00', card4: null },
  },
  {
    id: 'woori-bank',
    text: '우리 10/20 14:32\n*1234\n출금 35,000\n잔액 1,200,000\n스타벅스',
    expect: { issuer: '우리은행', channel: 'bank', status: 'withdrawal', amount: 35000, merchant: '스타벅스', card4: null, date: '2026-10-20', time: '14:32' },
  },
  {
    id: 'hana-bank',
    text: '[하나은행] 10/03 09:40 입금 1,200,000원 급여 잔액 2,000,000원',
    expect: { issuer: '하나은행', channel: 'bank', status: 'deposit', kind: 'income', amount: 1200000, merchant: '급여', date: '2026-10-03', time: '09:40' },
  },
  {
    id: 'nh-bank',
    text: '[NH농협] 10/14 08:22\n302-****-123456\n최*아\n출금 55,000원\n잔액 800,000원\n월세',
    expect: { issuer: 'NH농협은행', channel: 'bank', status: 'withdrawal', amount: 55000, merchant: '월세', date: '2026-10-14', time: '08:22' },
  },
  {
    id: 'generic',
    text: '[Web발신]\n카드 승인 15,000원 10/20 08:01 김밥천국',
    expect: { issuer: null, channel: 'card', status: 'approval', amount: 15000, merchant: '김밥천국', date: '2026-10-20', time: '08:01' },
  },
];

export const MULTI_SMS = `[Web발신]
신한카드(1101)승인 김*별 4,500원(일시불)10/20 08:10 스타벅스 강남R점

[Web발신]
신한카드(1101)승인 김*별 35,000원(일시불)10/18 12:00 (주)이마트

[Web발신]
신한카드(1101)취소 김*별 4,500원(일시불)10/20 09:05 스타벅스 강남R점`;
