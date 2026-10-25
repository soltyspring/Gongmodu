import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { createDartClient, dateWindows, documentData, DartError, readGroups, type DartReport, type DartGroup } from '../server/dart/client.ts';
import { documentGroups, documentUnderwriters, ipoEvidence, latestOfferings, normalizeOffering, originalDate, parseDartDates } from '../server/dart/normalize.ts';
import { createFeed } from '../server/feed.ts';
import { collectDartSchedule, DART_SOURCE } from '../server/dart/collect.ts';
import { exportCalendar, type ScheduleResponse } from '../shared/schedule.ts';

const key = 'a'.repeat(40);
const report: DartReport = { corp_code:'12345678', corp_name:'테스트기업', corp_cls:'E', rcept_no:'20261022000123', rcept_dt:'20261022', report_nm:'[기재정정]증권신고서(지분증권)', rm:'' };
const original = { ...report, rcept_no:'20260917000123', rcept_dt:'20260917', report_nm:'증권신고서(지분증권)' };
const text = '1. 정정대상 신고서의 최초제출일 : 2026년 09월 17일\n제1부 모집 또는 매출에 관한 사항\nI. 모집 또는 매출에 관한 일반사항\n금번 테스트기업의 코스닥시장 상장공모는 일반공모 방식에 의합니다.\n제2부 발행인에 관한 사항';
function groups(receipt = report.rcept_no, sbd = '2026년 10월 26일 ~ 2026년 10월 27일'): DartGroup[] {
  const base = { rcept_no:receipt, corp_code:'12345678', corp_name:'테스트기업' };
  return [{ title:'일반사항', list:[{...base,sbd,pymd:'2026년 10월 29일',asand:'2026년 10월 29일'}] },{ title:'증권의종류',list:[{...base,slmthn:'일반공모',slprc:'12,000'}] },{ title:'인수인정보',list:[{...base,actnmn:'삼성증권'},{...base,actnmn:'NH투자증권'}] }];
}
const response = (): ScheduleResponse => ({ events:normalizeOffering(report,groups(),text).events, fetchedAt:'2026-10-25T03:00:00Z',stale:false,source:DART_SOURCE });
test('한국어/ISO/점/압축 날짜와 exclusive 종료일, 잘못되거나 불명확한 기간 거부', () => {
  for (const value of ['2026년 10월 26일 ~ 2026년 10월 27일','2026.10.26 ~ 2026.10.27','2026-10-26 ~ 2026-10-27','20261026 ~ 20261027']) assert.deepEqual(parseDartDates(value),{start:'2026-10-26',last:'2026-10-27'});
  for (const value of ['미정','2026.02.30','2026.10.26 ~ 미정','2026.10.27 ~ 2026.10.26','2026.10.01 ~ 2026.11.30','2026.10.26 / 2026.10.27 / 2026.10.28']) assert.equal(parseDartDates(value),null);
  const [event] = response().events;
  assert.equal(event.end,'2026-10-28'); assert.equal(event.broker,'삼성증권, NH투자증권');
  assert.equal(event.kind,'subscription'); assert.equal(response().events.length,1);
  assert.equal(event.disclosure?.paymentText,'2026년 10월 29일');
});
test('정정 공시가 관심 ID를 유지하며 최신 접수번호로 대체, 다른 회차는 분리', () => {
  const old = normalizeOffering(original,groups(original.rcept_no),text).events[0];
  const corrected = normalizeOffering(report,groups(report.rcept_no,'2026.11.02 ~ 2026.11.03'),text).events[0];
  assert.equal(old.id,corrected.id);
  const latest = latestOfferings([corrected,old]);
  assert.equal(latest.length,1); assert.equal(latest[0].start,'2026-11-02');
  const second = normalizeOffering({...original,rcept_dt:'20260918',rcept_no:'20260918000123'},groups('20260918000123'),text).events[0];
  assert.notEqual(second.id,old.id);
});
test('철회·정정 대기·주주배정·해외공모·출처 불일치를 신규상장 청약으로 노출하지 않음', () => {
  assert.equal(normalizeOffering({...report,rm:'철'},groups(),text).events.length,0);
  assert.equal(normalizeOffering({...report,rm:'정'},groups(),text).events.length,0);
  const rights = groups(); rights[1].list[0].slmthn = '주주배정후 실권주 일반공모';
  assert.equal(normalizeOffering(report,rights,text).reason,'not_ipo');
  assert.equal(normalizeOffering(report,groups(),'나스닥 상장 예정').reason,'ipo_unconfirmed');
  assert.equal(normalizeOffering(report,groups('20260917000123'),text).reason,'summary_unmatched');
  assert.equal(ipoEvidence('제1부 모집 또는 매출에 관한 사항\n일반공모\n제2부 발행인에 관한 사항\n과거 자회사의 코스닥시장 상장공모'),false);
});
test('XML/HTML 혼합 원문의 순서·표를 보존하고 마지막 정정 후 표에서 날짜/가액/인수인 추출', () => {
  const table = (dates:string, price:string) => `<TABLE><TR><TH>청약기일</TH><TH>납입기일</TH><TH>배정공고일</TH></TR><TR><TD>${dates}</TD><TD>2026.10.29</TD><TD>2026.10.29</TD></TR></TABLE><TABLE><TR><TH>증권의종류</TH><TH>모집(매출)가액</TH><TH>모집(매출)방법</TH></TR><TR><TD>보통주</TD><TD>${price}</TD><TD>일반공모</TD></TR></TABLE>`;
  const xml = `<DOCUMENT><P>정정 전<BR></BR><IMG></IMG></P>${table('2026.10.20 ~ 2026.10.21','10,000')}<P>정정 후</P>${table('2026.10.26 ~ 2026.10.27','12,000')}<TABLE><TR><TH>인수인</TH><TH>인수수량</TH></TR><TR><TD>대표주관회사</TD><TD>삼성증권</TD><TD>1,000</TD></TR></TABLE></DOCUMENT>`;
  const document = documentData(zipSync({'20261022000123.xml':strToU8(xml)}));
  const extracted = documentGroups(report,document);
  assert.equal(extracted[0].list[0].sbd,'2026.10.26 ~ 2026.10.27'); assert.equal(extracted[1].list[0].slprc,'12,000'); assert.equal(extracted[2].list[0].actnmn,'삼성증권');
  assert.throws(()=>documentData(strToU8('<result><status>020</status></result>')),/DART_020/);
});

test('대표·공동 표기와 다단 인수인 표를 읽고 최신 표의 증권사만 유지', () => {
  const headers = ['인수인','증권의 종류','인수수량','인수금액','인수방법'];
  const document = { text, tables: [
    [headers,['대표','이전증권','보통주','100','1000','총액인수']],
    [headers,['대표','SK증권','보통주','100','1000','총액인수'],['인수','한화투자증권','보통주','100','1000','총액인수']],
    [['참고 증권사','인수수량'],['대표','무관증권','100']],
  ] };
  assert.deepEqual(documentUnderwriters(report,document).map(r=>r.actnmn),['SK증권','한화투자증권']);
  const contract = {text,tables:[[['인수인','인수주식의종류와 수량','인수금액','인수조건'],['구분','명칭','주소'],['대표주관회사','㈜아이엠증권','서울','보통주 100','1000','총액인수']]]};
  assert.equal(documentUnderwriters(report,contract)[0].actnmn,'㈜아이엠증권');
});

test('접수번호가 맞는 요약에도 인수인이 빠지면 같은 원문으로 보완하고 근거를 기록', () => {
  const summary = groups(); summary[2].list = [];
  const document = {text,tables:[[['인수인','인수수량'],['대표','아이엠증권','100']]]};
  const event = normalizeOffering(report,summary,document).events[0];
  assert.equal(event.broker,'아이엠증권'); assert.equal(event.disclosure?.brokerSource,'document');
  const api = normalizeOffering(report,groups(),document).events[0];
  assert.equal(api.broker,'삼성증권, NH투자증권'); assert.equal(api.disclosure?.brokerSource,'summary');
  const wrongReceipt = groups(); wrongReceipt[2].list.forEach(r=>r.rcept_no = original.rcept_no);
  assert.equal(normalizeOffering(report,wrongReceipt,{text,tables:[]}).events[0].broker,null);
  assert.equal(normalizeOffering(report,wrongReceipt,{text,tables:[]}).events[0].disclosure?.brokerSource,'unconfirmed');
  const wrongCompany = groups(); wrongCompany[2].list.forEach(r=>r.corp_code='00000000');
  assert.equal(normalizeOffering(report,wrongCompany,{text,tables:[]}).events[0].broker,null);
});
test('공시 목록 전 페이지 및 3개월 제한 범위 분할, 013과 인증/한도 오류 구분', async () => {
  const windows = dateWindows('2026-01-01','2026-07-01'); assert.equal(windows.length,3);
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { const url=new URL(String(input));urls.push(url);const page=url.searchParams.get('page_no'); return new Response(JSON.stringify({status:'000',total_page:2,list:[page==='1'? report:original]})); };
  const reports = await createDartClient(key,fetcher,0).reports('2026-10-01','2026-10-25');
  assert.equal(reports.length,2); assert.equal(urls[0].searchParams.get('last_reprt_at'),'Y'); assert.equal(urls[1].searchParams.get('page_no'),'2');
  assert.deepEqual(readGroups({status:'013'}),[]);
  for (const code of ['010','012','020','800']) assert.throws(()=>readGroups({status:code}),new RegExp(`DART_${code}`));
});
test('수집기가 공시목록→주요정보→ZIP 원문을 조합하고 인증키를 응답과 오류에서 제외', async () => {
  const fetcher: typeof fetch = async input => {
    const url=new URL(String(input));
    if (url.pathname.endsWith('list.json')) return Response.json({status:'000',total_page:1,list:[report]});
    if (url.pathname.endsWith('estkRs.json')) return Response.json({status:'000',group:groups()});
    return new Response(zipSync({'source.xml':strToU8(`<DOCUMENT><P>${text}</P></DOCUMENT>`)}));
  };
  const result=await collectDartSchedule({key,fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
  assert.equal(result.events.length,1); assert.ok(!JSON.stringify(result).includes(key));
  assert.equal(result.quality?.missingBrokerCount,0);
  const ics=exportCalendar(result.events); assert.ok(ics.includes('https://dart.fss.or.kr/dsaf001/main.do?rcpNo='));
  const failing=createDartClient(key,(async()=>{throw new Error(`secret=${key}`);}) as typeof fetch,0);
  await assert.rejects(failing.reports('2026-10-01','2026-10-25'),error => error instanceof DartError && !error.message.includes(key));
});

test('주관사 미확인 일정은 추정 없이 품질 점검 목록에 접수번호·원문 URL과 함께 반환', async () => {
  const incomplete = groups(); incomplete[2].list = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('list.json')) return Response.json({status:'000',total_page:1,list:[report]});
    if (url.pathname.endsWith('estkRs.json')) return Response.json({status:'000',group:incomplete});
    return new Response(zipSync({'source.xml':strToU8(`<DOCUMENT><P>${text}</P></DOCUMENT>`)}));
  };
  const result = await collectDartSchedule({key,fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
  assert.equal(result.events.length,1); assert.equal(result.events[0].broker,null);
  assert.equal(result.quality?.missingBrokerCount,1);
  assert.deepEqual(result.quality?.brokerReview,[{eventId:result.events[0].id,company:report.corp_name,receiptNo:report.rcept_no,sourceUrl:result.events[0].disclosure!.sourceUrl}]);
});
test('단일 수집 작업 공유, 실패 시 마지막 정상 DART 데이터·확인 시각 유지', async () => {
  let calls=0,fail=false,clock=Date.parse('2026-10-25T03:00:00Z');
  const feed=createFeed({key:()=>key,snapshotPath:null,now:()=>clock,ttlMs:1000,collect:async()=>{calls++; if(fail) throw new DartError('DART_020'); return response();}});
  const [a,b]=await Promise.all([feed.sync(),feed.sync()]); assert.equal(calls,1);assert.deepEqual(a,b);
  clock+=61000;fail=true; await assert.rejects(feed.sync());
  const stale=await feed();assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,a.fetchedAt);assert.deepEqual(stale.events,a.events);
});
test('인증키 미설정/형식 오류는 명시적 오류이며 이전 Google 피드로 대체하지 않음', async () => {
  for (const value of [undefined,'bad']) {
    const feed=createFeed({key:()=>value,snapshotPath:null,collect:async()=>{throw new Error('must not fetch');}});
    await assert.rejects(feed(),new RegExp(value?'DART_KEY_INVALID':'DART_KEY_MISSING'));
  }
});


test('공시의 줄여 쓴 청약 종료일과 최초 제출일 뒤 정정 이력을 섞지 않음',()=>{
  assert.deepEqual(parseDartDates('2026.10.22(목)~10.23(금)'),{start:'2026-10-22',last:'2026-10-23'});
  for(const bad of ['2026.10.22~미정','2026.10.22~10.32','2026.12.31~01.01','2026.10.22~10.23 / 10.24'])assert.equal(parseDartDates(bad),null);
  const longHistory='최초제출일 :\n\n2026년 9월 21일'+'\n'.repeat(40)+'제출일자 문서명 2026년 09월 21일 최초 제출 2026년 10월 16일 정정';
  assert.equal(originalDate(report,longHistory),'2026-09-21');
});

test('이미 상장한 K/Y 회사의 IPO도 수집하고 주주배정 증자는 원문 요청 전에 제외',async()=>{
  for(const corp_cls of ['K','Y']){
    let documentCalls=0;
    const listed={...report,corp_cls};
    const fetcher:typeof fetch=async input=>{
      const u=new URL(String(input));
      if(u.pathname.endsWith('list.json'))return Response.json({status:'000',total_page:1,list:[listed]});
      if(u.pathname.endsWith('estkRs.json'))return Response.json({status:'000',group:groups()});
      documentCalls++;return new Response(zipSync({'s.xml':strToU8(`<DOCUMENT><P>${text}</P></DOCUMENT>`)}));
    };
    const result=await collectDartSchedule({key,fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
    assert.equal(result.events.length,1);assert.equal(documentCalls,1);
  }
  let docs=0;
  const rights=groups();rights[1].list[0].slmthn='주주배정후 실권주 일반공모';
  const fetcher:typeof fetch=async input=>{
    const u=new URL(String(input));
    if(u.pathname.endsWith('list.json'))return Response.json({status:'000',total_page:1,list:[{...report,corp_cls:'K'}]});
    if(u.pathname.endsWith('estkRs.json'))return Response.json({status:'000',group:rights});
    docs++;throw new Error('Rights offering must not request an IPO document.');
  };
  const result=await collectDartSchedule({key,fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
  assert.equal(result.events.length,0);assert.equal(docs,0);
});

test('원문 파일 없음 오류는 해당 공시만 제외하고 수집 범위를 기록',async()=>{
  const fetcher:typeof fetch=async input=>{
    const u=new URL(String(input));
    if(u.pathname.endsWith('list.json'))return Response.json({status:'000',total_page:1,list:[report]});
    if(u.pathname.endsWith('estkRs.json'))return Response.json({status:'000',group:groups()});
    return new Response('<result><status>014</status></result>');
  };
  const result=await collectDartSchedule({key,fetcher,delayMs:0,now:()=>Date.parse('2026-10-25T03:00:00Z'),lookbackDays:20});
  assert.equal(result.events.length,0);assert.equal(result.coverage?.reasons.document_unavailable,1);
});
