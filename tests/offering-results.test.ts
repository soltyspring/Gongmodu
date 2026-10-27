import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandForecast, subscriptionResult, tableNumber } from '../server/dart/offering-results.ts';
import type { DartDocument } from '../server/dart/client.ts';

const receiptNo = '20260909000307';
const doc = (tables: string[][][]): DartDocument => ({ text: '', tables });
// Shapes copied from 네오사피엔스's final-terms filing and issue-results report.
const demand = [['구분','국내 기관투자자','외국 기관투자자','합계'],['운용사(집합)','운용사(고유)'],['공모','사모'],
  ['건수','462','129','116','11','1','248','34','22','22','1,045'],
  ['수량','160,482,000','69,844,000','36,122,000','6,094,000','1,000','39,270,000','15,746,000','985,000','797,000','329,341,000'],
  ['경쟁률','106.99','46.56','24.08','4.06','0.00','26.18','10.50','0.66','0.53','219.56']];
const prices = [['구분','참여건수 기준','신청수량 기준'],['참여건수(건)','비율','신청수량(주)','비율'],['가격 미제시','-','-','-','-'],
  ['15,800원(상단) 초과','3','0.29%','466,000','0.14%'],['15.800원(상단)','65','6.22%','19,492,000','5.92%'],
  ['13,800원(하단) 초과 ~ 15,800원(상단) 미만','5','0.48%','68,000','0.02%'],['13,800원','426','40.77%','167,194,000','50.77%'],
  ['13,800원(하단) 미만','546','52.25%','142,121,000','43.15%'],['합계','1,045','100.00%','329,341,000','100.00%']];
const lockup = [['구분','외국 기관투자자','합계'],['건수','수량','신청가격'],['15일 확약','-','-','-','-','-','-','46','29,569,000','13,974'],
  ['미확약','22','985,000','14,545','22','797,000','14,163','999','299,772,000','12,093'],
  ['합 계','22','985,000','14,545','22','797,000','14,163','1,045','329,341,000','12,176']];

test('표 숫자는 쉼표·소수를 읽고 대시·빈칸·문자는 0으로 바꾸지 않아요', () => {
  assert.equal(tableNumber('1,160.70'), 1160.7);
  for (const v of ['-', '', undefined, '약 100', '1,000원']) assert.equal(tableNumber(v), null);
});

test('수요예측 경쟁률·참여건수·밴드 상단 이상 비율·확약 비율을 같은 공시의 합계와 맞춰 읽어요', () => {
  const d = demandForecast(doc([demand, prices, lockup]), receiptNo)!;
  assert.equal(d.ratio, 219.56); assert.equal(d.participants, 1045);
  assert.deepEqual(d.band, { low: 13800, high: 15800 });
  assert.equal(Number(d.aboveUpperShare!.toFixed(4)), 0.0651); // (3 + 65) / 1,045, '15.800원' typo included
  assert.equal(Number(d.committedShare!.toFixed(4)), 0.0898);   // 1 − 299,772,000 / 329,341,000
  assert.equal(d.sourceUrl, `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`);
});

test('합계가 다른 표·고정가 스팩·충돌하는 결과는 추정하지 않고 비워요', () => {
  const otherTotal = prices.map(row => row[0] === '합계' ? ['합계', '999', '100%', '1', '100%'] : row);
  const lockOther = lockup.map(row => row[0] === '합 계' ? [...row.slice(0, -2), '1', '1'] : row);
  const d = demandForecast(doc([demand, otherTotal, lockOther]), receiptNo)!;
  assert.equal(d.aboveUpperShare, null); assert.equal(d.band, null); assert.equal(d.committedShare, null);
  // A middle range mistyped as '22,000원 초과 ~19,000원 미만' must not count as above the band.
  const typo = [['구분','참여건수 기준'],['22,000원 초과','11','1.0%','6,442,000','1.4%'],['22,000원','270','23.9%','168,304,000','37.7%'],
    ['22,000원 초과 ~19,000원 미만','4','0.4%','18,000','0.0%'],['19,000원','290','25.7%','48,600,000','10.9%'],
    ['19,000원 미만','553','49.0%','223,042,000','49.9%'],['합계','1,128','100.0%','446,593,000','100.0%']];
  const fixed = demand.map(row => row[0] === '건수' ? [...row.slice(0, -1), '1,128'] : row);
  assert.equal(demandForecast(doc([fixed, typo]), receiptNo)!.aboveUpperShare, 281 / 1128);
  const spac = [['구분','참여건수(건)','비율','신청수량(주)','비율'],['2,000원','2,040','100%','6,670,172,000','100%'],['2,000원 초과','0','0%','0','0%'],['2,000원 미만','0','0%','0','0%'],['합계','1,045','100%','1','100%']];
  assert.equal(demandForecast(doc([demand, spac]), receiptNo)!.band, null);
  const conflict = demand.map(row => row[0] === '경쟁률' ? [...row.slice(0, -1), '300.00'] : row);
  assert.equal(demandForecast(doc([demand, conflict]), receiptNo), null);
  assert.equal(demandForecast(doc([prices]), receiptNo), null);
});

const allocation = (rows: string[][]) => [['청약현황','배정현황'],['균등방식','비례방식','총 배정수량','배정비율'],
  ['청약단위','청약건수','청약수량(A)','배정건수','1건당배정수량','추가배정건수','1건당 추가배정수량','균등배정수량(B)','배정건수','1건당배정수량','추가배정건수','1건당 추가배정수량','비례배정수량(C)','(D=B+C)','(D/A)'], ...rows];
const committed = [['확약기간','국내 기관투자자','외국 기관투자자','합계'],['수량','비중'],
  ['15일 확약','651,488','57.79','-','-','5,824','5.30','3,010','2.8','-','-','-','-','660,322','44.02'],
  ['미확약','475,757','42.21','73,734','100.00','104,134','94.70','101,431','97.12','77,148','100.00','7,474','100.00','839,678','55.98'],
  ['계','1,127,245','100.00','73,734','100.00','109,958','100.00','104,441','100.00','77,148','100.00','7,474','100.00','1,500,000','100.00']];

test('청약 결과는 총계 행으로 경쟁률·청약건수·균등 평균·기관 확약 비율을 계산해요', () => {
  const r = subscriptionResult(doc([allocation([['20','72,696','1,453,920','72,696','2','24,226','1','169,618','-','-','-','-','-','169,618','11.67%'],
    ['총계','107,233','523,890,410','107,233','-','35,534','-','250,000','29,156','--','2,846','-','250,000','500,000','0.95%']]), committed]), '20260915000379')!;
  assert.equal(Number(r.ratio.toFixed(2)), 1047.78); assert.equal(r.applicants, 107233);
  assert.equal(Number(r.equalSharesPerApplicant.toFixed(2)), 2.33); assert.equal(Number(r.committedShare!.toFixed(4)), 0.4402);
});

test('주관사별 표를 합치고, 총계 행이 없으면 행마다 균등+비례=합계가 맞을 때만 더해요', () => {
  const a = allocation([['총계','100','10,000','-','-','-','-','50','-','-','-','-','50','100','-']]);
  const b = allocation([['합계','50','2,000','-','-','-','-','25','-','-','-','-','25','50','-']]);
  assert.equal(subscriptionResult(doc([a, b, a]), receiptNo)!.ratio, 12000 / 150); // duplicate table counted once
  const units = allocation([['10','10','100','-','-','-','-','10','-','-','-','-','-','10','-'],['20','10','200','-','-','-','-','10','-','-','-','-','5','15','-'],['30','10','300','-','-','-','-','10','-','-','-','-','10','20','-']]);
  assert.equal(subscriptionResult(doc([units]), receiptNo)!.applicants, 30);
  const broken = allocation([['총계','100','10,000','-','-','-','-','50','-','-','-','-','50','99','-']]);
  assert.equal(subscriptionResult(doc([broken]), receiptNo), null);
  assert.equal(subscriptionResult(doc([committed]), receiptNo), null);
});
