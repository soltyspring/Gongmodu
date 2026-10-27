import test from 'node:test';
import assert from 'node:assert/strict';
import { disclosedSubscriptionClose } from '../server/dart/details.ts';
import { isSubscriptionClosed, verifiedCloseTime, type ScheduleEvent } from '../shared/schedule.ts';

const receipt = '20261015000345';
const url = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receipt}`;
const event = { kind:'subscription', start:'2026-11-02', end:'2026-11-04', broker:'미래에셋증권', disclosure:{receiptNo:receipt,sourceUrl:url} } as ScheduleEvent;
const source = (text: string) => ({ document:{text, tables:[]}, receiptNo:receipt });
const statement = '주3) 청약기일 ①기관투자자, 일반청약자 청약일 : 2026년 11월 02일 ~ 03일 (2일간, 08:00부터~16:00까지)';

test('정확한 일반청약 기간·시간만 현재 공시와 주관사에 연결한다', () => {
  const result = disclosedSubscriptionClose(source(statement),event);
  assert.deepEqual(result,{time:'16:00',broker:'미래에셋증권',receiptNo:receipt,sourceUrl:url});
  const verified = {...event,disclosure:{...event.disclosure!,subscriptionClose:result}};
  assert.equal(isSubscriptionClosed(verified,Date.parse('2026-11-03T15:59:59+09:00')),false);
  assert.equal(isSubscriptionClosed(verified,Date.parse('2026-11-03T16:00:00+09:00')),true);
  assert.equal(verifiedCloseTime({...verified,kind:'refund'}),null);
  assert.equal(verifiedCloseTime({...verified,broker:'다른증권'}),null);
  assert.equal(verifiedCloseTime({...verified,disclosure:{...verified.disclosure!,receiptNo:'20261016000268'}}),null);
});
test('기관·추가납입 시간과 다른 날짜·복수 증권사·충돌 값은 버린다', () => {
  assert.equal(disclosedSubscriptionClose(source('기관투자자 청약일 : 2026년 11월 02일 ~ 03일 (08:00~16:00)'),event),null);
  assert.equal(disclosedSubscriptionClose(source('일반청약자 추가납입일 : 2026년 11월 02일 ~ 03일 (08:00~16:00)'),event),null);
  assert.equal(disclosedSubscriptionClose(source(statement.replace('03일','04일')),event),null);
  assert.equal(disclosedSubscriptionClose(source(statement),{...event,broker:'삼성증권, 미래에셋증권'}),null);
  assert.equal(disclosedSubscriptionClose(source(`${statement} ${statement.replace('16:00','15:00')}`),event),null);
  assert.equal(disclosedSubscriptionClose(source(`${statement} 온라인 채널별 청약시간이 다릅니다.`),event),null);
  assert.equal(disclosedSubscriptionClose(source(`${statement} 온라인 08:00~15:00, 영업점 09:00~16:00`),event),null);
  assert.equal(disclosedSubscriptionClose({...source(statement),receiptNo:'20261016000268'},event),null);
});
