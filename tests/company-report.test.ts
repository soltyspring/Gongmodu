import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyReport } from '../src/company-report';
import type { CompanySummary } from '../shared/schedule';

const base: CompanySummary = { overview:null,revenueModel:null,unit:'천원',scope:'연결',receiptNo:'20261022000123',sourceUrl:'',financials:[] };

test('최근 연간 실적으로 매출 성장률·영업이익률을 계산하고 반기는 연간 비교에 섞지 않아요', () => {
  const report = companyReport({...base,financials:[
    {period:'2026년 반기',revenue:'30,000,000',operatingProfit:'(1,000,000)',netIncome:null,accounting:null},
    {period:'2025년',revenue:'24,000,000',operatingProfit:'2,400,000',netIncome:'(500,000)',accounting:null},
    {period:'2024년',revenue:'20,000,000',operatingProfit:'(1,000,000)',netIncome:null,accounting:null},
    {period:'2023년',revenue:'10,000,000',operatingProfit:'(2,000,000)',netIncome:null,accounting:null},
  ]});
  assert.equal(report.period,'2025년');
  assert.deepEqual(report.kpis.map(k=>[k.label,k.value,k.note,k.tone]),[
    ['매출','240억원','2024년보다 ▲ 20%','up'],
    ['영업이익','24억원','영업이익률 10%','neutral'],
    ['순이익','-5억원','순손실','down'],
  ]);
  assert.deepEqual(report.insights,['매출이 3년 연속 늘었어요.','2025년에 영업이익이 흑자로 바뀌었어요.','2026년 반기 영업손실은 10억원이에요.']);
});

test('미확인 값은 KPI와 해석에서 빼고 0이나 성장률로 추정하지 않아요', () => {
  const report = companyReport({...base,financials:[
    {period:'2025년',revenue:'24,000,000',operatingProfit:null,netIncome:null,accounting:null},
    {period:'2024년',revenue:'-',operatingProfit:'(1,000)',netIncome:null,accounting:null},
  ]});
  assert.deepEqual(report.kpis.map(k=>k.label),['매출']);
  assert.equal(report.kpis[0].note,null);
  assert.deepEqual(report.insights,[]);
  assert.deepEqual(companyReport(base),{period:null,kpis:[],insights:[]});
});


test('문장 속 기간은 공시의 기수 표기를 빼고 읽기 쉽게 써요', () => {
  const report = companyReport({...base,financials:[
    {period:'2026년 반기(제30기)',revenue:'6,000,000',operatingProfit:'1,000,000',netIncome:null,accounting:null},
    {period:'2025년(제29기)',revenue:'24,000,000',operatingProfit:'2,000,000',netIncome:null,accounting:null},
    {period:'2024년(제28기)',revenue:'20,000,000',operatingProfit:'(500,000)',netIncome:null,accounting:null},
  ]});
  assert.equal(report.period,'2025년');
  assert.equal(report.kpis[0].note,'2024년보다 ▲ 20%');
  assert.deepEqual(report.insights,['2025년에 영업이익이 흑자로 바뀌었어요.','2026년 반기 영업이익은 10억원이에요.']);
});
