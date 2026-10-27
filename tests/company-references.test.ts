import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIrgoReferences,robotsAllowsReferences,enrichCompanyReferences} from '../server/company-references.ts';
import {companyReferences,type ScheduleResponse,type ScheduleEvent} from '../shared/schedule.ts';
const url='https://m.irgo.co.kr/IPO%EC%9E%90%EB%A3%8C/123/TB/test-IR-BOOK';
const card=(company='테스트기업',link=url,date='2026-10-22')=>`<div class="section card-template type1" data-href="${link}"><div><span class="txt-name">${company}</span><span class="txt-title">[IPO] ${company} IR BOOK</span><span class="txt-date">${date}</span></div></div>`;
const event={id:'test',kind:'subscription',company:'테스트기업',start:'2026-11-02',end:'2026-11-04',disclosure:{offeringId:'test-2026',originalFiledOn:'2026-09-01'}} as ScheduleEvent;
const data={events:[event],fetchedAt:'2026-10-27T09:00:00Z'} as ScheduleResponse;
test('기업 이름·IPO 자료 종류·공식 호스트를 확인하고 외부 링크와 뉴스는 제외',()=>{
  assert.equal(parseIrgoReferences(card()).length,1);
  assert.equal(parseIrgoReferences(card('테스트기업','https://evil.example/IPO자료/123/TB/test')).length,0);
  assert.equal(parseIrgoReferences(card().replace('IR BOOK','일반 뉴스')).length,0);
  assert.equal(companyReferences({...event,disclosure:{...event.disclosure!,companyReferences:[{company:'다른기업',sourceName:'IRGO',sourceUrl:url,fetchedAt:data.fetchedAt}]}}).length,0);
});
test('로봇 접근 규칙이 바뀌거나 접근에 실패하면 자료 수집을 중단',async()=>{
  assert.equal(robotsAllowsReferences('User-agent: *\nAllow: /'),true);
  assert.equal(robotsAllowsReferences('User-agent: *\nDisallow: /IPO'),false);
  let calls=0;const result=await enrichCompanyReferences(data,async()=>{calls++;return new Response('User-agent: *\nDisallow: /');},Date.parse(data.fetchedAt));
  assert.equal(calls,1);assert.equal(result,data);
  assert.equal(await enrichCompanyReferences(data,async()=>{throw new Error('offline');},Date.parse(data.fetchedAt)),data);
});
test('정기 수집에서 두 페이지를 한 번씩 읽고 DART 숫자를 바꾸지 않으며 과거 자료를 제외',async()=>{
  let calls=0;
  const fetcher=(async(input:RequestInfo|URL)=>{calls++;return new Response(String(input).endsWith('robots.txt')?'User-agent: *\nAllow: /':card()+card('다른기업')+card('테스트기업',url.replace('123','456'),'2020-01-01'));}) as typeof fetch;
  const enriched=await enrichCompanyReferences(data,fetcher,Date.parse(data.fetchedAt));assert.equal(calls,2);
  const links=companyReferences(enriched.events[0]);assert.equal(links.length,1);assert.equal(links[0].sourceUrl,url);assert.equal(enriched.fetchedAt,data.fetchedAt);
  assert.equal(data.events[0].disclosure!.companyReferences,undefined);
});
