import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCompany } from '../server/dart/company.ts';
import { publicSchedule } from '../server/public-schedule.ts';
import type { ScheduleResponse } from '../shared/schedule.ts';

const receiptNo='20261015000345';
const body='타사 추정매출 999억\n제2부 발행인에 관한 사항\nI. 회사의 개요\n주요 사업의 내용\n당사는 의료기기 부품을 제조하여 공급하는 기업입니다.\nII. 사업의 내용\n글로벌 시장 매출은 100억 달러입니다.\n당사의 사업은 제품 제조와 공급 사업으로 구분됩니다. 자사 제품을 판매하여 발생하는 매출로 구성됩니다.\nIII. 재무에 관한 사항\n1. 요약재무정보\n가. 요약연결재무정보\n(단위: 천원)\n';
const table=[['구분','2026년 반기','2025년','2024년'],['회계처리기준','K-IFRS','K-IFRS','K-GAAP'],['매출액','10,000','20,000','0'],['영업이익(영업손실)','(1,000)','2,000','0'],['당기순이익(당기순손실)','(2,000)','1,500','0']];
const source={receiptNo,document:{text:body,tables:[table],tableOffsets:[body.length-1]}};
test('발행인의 사업 문장과 단위·기간·회계기준이 있는 재무정보를 연결하고 손실을 보존',()=>{
  const result=summarizeCompany(source);
  assert.match(result.overview!,/의료기기/);assert.match(result.revenueModel!,/제조와 공급/);assert.doesNotMatch(result.revenueModel!,/글로벌 시장/);
  assert.equal(result.unit,'천원');assert.equal(result.scope,'연결 요약재무정보');assert.equal(result.financials[0].operatingProfit,'(1,000)');assert.equal(result.financials[2].revenue,'0');assert.equal(result.financials[2].accounting,'K-GAAP');assert.equal(result.receiptNo,receiptNo);
  assert.equal(result.financials[0].netIncome,'(2,000)');
});
test('주식 가치평가·타사·단위 없는 숫자·예상 실적을 회사 재무정보로 만들지 않는다',()=>{
  assert.equal(summarizeCompany({receiptNo,document:{text:'비교회사 주요 사업의 내용 의료기기 기업입니다.',tables:[table]}}).overview,null);
  assert.deepEqual(summarizeCompany({...source,document:{...source.document,text:body.replace('(단위: 천원)','')}}).financials,[]);
  const forecast=table.map(row=>[...row]);forecast[0][1]='2026년 추정';
  assert.equal(summarizeCompany({...source,document:{...source.document,tables:[forecast]}}).financials.some(r=>/추정/.test(r.period)),false);
  assert.deepEqual(summarizeCompany({...source,document:{...source.document,tableOffsets:undefined}}).financials,[]);
});
test('공개 일정에서 사용하지 않는 원문·청약 계산정보를 제거하고 기업 요약은 유지',()=>{
  const summary=summarizeCompany(source);
  const data={events:[{description:'long raw source',disclosure:{terms:{large:'unused'},companySummary:summary}}]} as unknown as ScheduleResponse;
  const result=publicSchedule(data);assert.equal(result.events[0].description,'');assert.equal(result.events[0].disclosure!.terms,undefined);assert.equal(result.events[0].disclosure!.companySummary,summary);assert.equal(data.events[0].description,'long raw source');
});
