import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialChartData, financialNumber, financialPeriod } from '../src/financial-chart';
import type { CompanySummary } from '../shared/schedule';

test('공시 숫자의 손실·0·미확인을 구분하고 텍스트를 임의의 수치로 바꾸지 않아요', () => {
  assert.equal(financialNumber('(1,200.5)'), -1200.5);
  assert.equal(financialNumber('−1,200'), -1200);
  assert.equal(financialNumber('0'), 0);
  for (const value of [null, undefined, '-', '미확인', '약 100', '1,000원']) assert.equal(financialNumber(value), null);
});

test('천원 단위를 억원으로 환산하고 손실이 0 아래에 놓이는 같은 축을 사용해요', () => {
  const summary: CompanySummary = { overview:null,revenueModel:null,unit:'천원',scope:'연결',receiptNo:'20261022000123',sourceUrl:'',financials:[
    {period:'2026년 반기',revenue:'12,000,000',operatingProfit:'(2,000,000)',netIncome:'(3,000,000)',accounting:null},
    {period:'2025년',revenue:'24,000,000',operatingProfit:'0',netIncome:null,accounting:null},
    {period:'2024년',revenue:'10,000,000',operatingProfit:null,netIncome:null,accounting:null},
  ]};
  const chart = financialChartData(summary);
  assert.deepEqual(chart.rows.map(row=>row.period),['2024년','2025년','2026년 반기']);
  assert.equal(chart.unit,'억원');assert.equal(chart.divisor,100000);
  assert.ok(chart.low<=-30&&chart.high>=240);assert.ok(chart.ticks.includes(0));
  const noIncome = financialChartData({...summary,financials:summary.financials.map(row=>({...row,netIncome:null}))});
  assert.equal(noIncome.metrics.length,2);
  const zeros = financialChartData({...summary,financials:[{...summary.financials[0],revenue:'0',operatingProfit:'0',netIncome:null}]});
  assert.ok(zeros.high>zeros.low);
  assert.equal(financialPeriod('제10기(2026년3월말)').suffix,'3월말');
  assert.equal(financialPeriod('2026연도 1분기(제12기)').suffix,'1분기');
});
