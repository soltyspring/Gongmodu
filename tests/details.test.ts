import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync,strToU8 } from 'fflate';
import { disclosedDates, offeringTerms, offeringScope } from '../server/dart/details.ts';
import { documentData, type DartDocument } from '../server/dart/client.ts';
import { collectDartSchedule } from '../server/dart/collect.ts';

const receiptNo='20261022000123';
const source=(text:string,tables:string[][][]=[])=>( {receiptNo,document:{text,tables}} );
test('환불 날짜 명시와 납입일 당일 반환 문구를 구분하고 단순 납입일은 환불로 쓰지 않음',()=>{
  const explicit=disclosedDates(source('초과 청약증거금이 있는 경우 이를 2026년 10월 29일에 환불합니다.'),'2026.10.30');
  assert.equal(explicit.refund?.date,'2026-10-29');assert.equal(explicit.refund?.basis,'explicit');
  assert.equal(disclosedDates(source('초과 청약증거금은 주금납입기일 당일에 반환합니다.'),'2026.10.30').refund?.date,'2026-10-30');
  assert.equal(disclosedDates(source('납입일 2026년 10월 30일'),'2026.10.30').refund,null);
  assert.equal(disclosedDates(source('초과 청약증거금은 2026.10.29에 환불합니다. 초과 청약증거금은 2026.10.30에 환불합니다.'),'2026.10.30').refund,null);
});
test('상장 예정일의 표·발행인 문장을 읽고 미정·타사 이력·유효하지 않은 날짜는 제외',()=>{
  const table=source('',[[['구분','일정'],['상장예정일','2026.11.04']]]);
  assert.equal(disclosedDates(table,null).listing?.date,'2026-11-04');
  assert.equal(disclosedDates(source('당사의 상장예정일은 2026년 11월 04일입니다.'),null).listing?.date,'2026-11-04');
  assert.equal(disclosedDates(source('당사의 상장예정일은 미정입니다.'),null).listing,null);
  assert.equal(disclosedDates(source('과거 자회사 상장일 2026년 02월 10일'),null).listing,null);
  assert.equal(disclosedDates(source('',[[['상장예정일','2026.02.30']]]),null).listing,null);
});
test('표 위치로 정정 전·발행인 이력 구간을 제외하고 모집 본문만 확인',()=>{
  const xml='<DOCUMENT><TABLE><TR><TD>환불일</TD><TD>2026.10.20</TD></TR></TABLE><P>I. 모집 또는 매출에 관한 일반사항</P><TABLE><TR><TD>환불일</TD><TD>2026.10.29</TD></TR></TABLE><P>제2부 발행인에 관한 사항</P><TABLE><TR><TD>상장예정일</TD><TD>2026.02.01</TD></TR></TABLE></DOCUMENT>';
  const document=documentData(zipSync({'s.xml':strToU8(xml)}));
  assert.equal(offeringScope(document).tables.length,1);
  const dates=disclosedDates({receiptNo,document},null);assert.equal(dates.refund?.date,'2026-10-29');assert.equal(dates.listing,null);
});
test('배정·증거금률·최소 청약단위를 해석하고 범위 값·기관 수수료를 단정하지 않음',()=>{
  const document:DartDocument={text:'균등방식 최소배정 예정물량은 625,000주입니다. 청약 당일 계좌 개설 후 온라인 청약 가능합니다.',tables:[
    [['구분','일반청약자 배정물량','최고 청약한도','청약증거금률'],['아이엠증권','1,250,000주','125,000주','100%']],
    [['청약주식수','청약단위'],['100주 이하','10주'],['100주 초과 ~ 500주 이하','50주']],
    [['청약수수료','일반고객','온라인','2,000원'],['우대고객','온라인','면제']],
  ]};
  const terms=offeringTerms({document,receiptNo},['아이엠증권'],'2,000',true);
  const broker=terms.brokers[0];
  assert.equal(broker.minShares,10);assert.deepEqual(broker.units[0],{from:10,to:100,step:10});assert.equal(broker.marginRate,1);assert.equal(broker.equalShares,625000);assert.match(broker.feeText!,/2,000원/);
  document.tables[0][1][1]='1,250,000주 ~ 1,500,000주';
  assert.equal(offeringTerms({document,receiptNo},['아이엠증권'],'2,000',true).brokers[0].allocatedShares,null);
});
test('변경부분만 있는 최종 공시는 동일 최초제출일의 전문으로 보완하고 환불 이벤트·원문 출처를 유지',async()=>{
  const latest={corp_code:'12345678',corp_name:'테스트기업',corp_cls:'E',rcept_no:receiptNo,rcept_dt:'20261022',report_nm:'[발행조건확정]증권신고서(지분증권)',rm:''};
  const original={...latest,rcept_no:'20260917000123',rcept_dt:'20260917',report_nm:'증권신고서(지분증권)'};
  const headings='I. 모집 또는 매출에 관한 일반사항\n코스닥시장 상장공모';
  const latestText=`최초 제출일: 2026년 09월 17일\n${headings}`;
  const fullText=`${headings}\n배정결과의 통지\n초과 청약증거금은 2026년 10월 29일에 환불합니다.`;
  const groups=(r:string)=>[{title:'일반사항',list:[{rcept_no:r,corp_code:'12345678',sbd:'2026.10.26~2026.10.27',pymd:'2026.10.29'}]},{title:'증권의종류',list:[{rcept_no:r,corp_code:'12345678',slmthn:'일반공모',slprc:'2000'}]}];
  const fetcher:typeof fetch=async input=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith('list.json'))return Response.json({status:'000',total_page:1,list:[url.searchParams.get('corp_code')?original:latest]});
    if(url.pathname.endsWith('estkRs.json'))return Response.json({status:'000',group:groups(receiptNo)});
    const full=url.searchParams.get('rcept_no')===original.rcept_no;
    const xml=`<DOCUMENT><P>${full?fullText:latestText}</P>${full?'<TABLE><TR><TH>청약기일</TH><TH>납입기일</TH></TR><TR><TD>2026.10.26~2026.10.27</TD><TD>2026.10.29</TD></TR></TABLE>':''}</DOCUMENT>`;
    return new Response(zipSync({'s.xml':strToU8(xml)}));
  };
  const result=await collectDartSchedule({key:'a'.repeat(40),fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
  assert.equal(result.events.length,2);
  const refund=result.events.find(e=>e.kind==='refund')!;assert.equal(refund.start,'2026-10-29');assert.equal(refund.end,'2026-10-30');assert.equal(refund.disclosure?.refund?.receiptNo,original.rcept_no);
});
