import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCompetitionFeed,parseDaishinCompetition,parseImCompetition,parseSamsungCompetition} from '../server/competition.ts';
import {allocationMetrics,isCompetitionResponse,mergeBrokerDates,subscriptionScenario} from '../shared/competition.ts';
import {exportCalendar,type ScheduleEvent} from '../shared/schedule.ts';

const im={p_a52:encodeURIComponent('공모주'),p_a55:encodeURIComponent('테스트기업(주)'),p_a64:'2026/10$1$1$2',p_a68:'N',p_a65:'2026/10/26',p_a66:'2026/10/27',p_a57:'2.00:1',p_a67:'4.00:1',p_a60:'10',p_a58:'1,000',p_a59:'2,000',p_a61:'2,000',p_a62:'100',p_a56:'2026/10/29',p_a63:'2026/11/04'};
const event:ScheduleEvent={id:'d:subscription',company:'테스트기업',title:'(청약) 테스트기업',kind:'subscription',start:'2026-10-26',end:'2026-10-28',broker:'아이엠증권',priceText:'2,000',description:'',updatedAt:null,allDay:true,startAt:'2026-10-26T00:00:00+09:00',endAt:'2026-10-28T00:00:00+09:00',disclosure:{offeringId:'d',corpCode:'12345678',receiptNo:'20261022000123',reportName:'증권신고서',filedOn:'2026-10-22',originalFiledOn:'2026-09-17',sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261022000123',priceLabel:'모집가액',subscriptionText:'2026.10.26~2026.10.27',paymentText:null,allocationText:null,corrected:false,terms:{pricePerShare:2000,priceConfirmed:true,brokers:[{broker:'아이엠증권',allocatedShares:1000,equalShares:500,marginRate:1,minShares:10,limitShares:100,units:[],feeText:null,eligibilityText:null,sourceUrl:'https://dart.fss.or.kr',receiptNo:'20261022000123'}]}}};
test('iM 공개 JSON을 해석하며 실권주·불명확한 날짜·조작된 링크 코드는 제외',()=>{
  const rows=parseImCompetition({COMPETITION_RATE:[im,{...im,p_a68:'1'},{...im,p_a52:encodeURIComponent('일반공모')},{...im,p_a65:'미정'},{...im,p_a64:'bad&url=example'}]});
  assert.equal(rows.length,1);assert.equal(rows[0].company,'테스트기업(주)');assert.equal(rows[0].allocatedShares,1000);assert.equal(rows[0].listingDate,'2026-11-04');assert.match(rows[0].sourceUrl,/key=2026\/10\$1\$1\$2$/);
});
test('삼성 일반청약만 읽고 기관 경쟁률을 제외하며 원본 기준일을 보존',()=>{
  const row={SBSN_ISUS_NAME:'테스트기업_일반 ',SBSN_STRT_DATE:'20261026',SBSN_END_DATE:'20261027',PRCE_DATE:'20261027',A_SBSN_CMPT_RATE:'0002.0000',A_PBLC_PRTN_PRPN_CMPT_RATE:'0003.0000',OWCM_GNRL_ALCN_QNTY:'00001000',VLD_ACTC:'0010',GNRL_SBSN_QNTY:'00002000'};
  const rows=parseSamsungCompetition({data:{result:{outRec2:[row,{...row,SBSN_ISUS_NAME:'테스트기업_국내기관'}]}}});
  assert.equal(rows.length,1);assert.equal(rows[0].totalRatio,2);assert.equal(rows[0].proportionalRatio,3);assert.equal(rows[0].sourceAsOf,'2026-10-27');
  assert.throws(()=>parseSamsungCompetition({data:{trMsg:'error'}}));
});
const daishinTable=(company='테스트기업',next=false)=>`<table><tr><th>종목구분</th><th>종목코드</th><th>청약일</th><th>발행가</th><th>총 경쟁률</th><th>비례경쟁률</th><th>청약건수</th></tr><tr><td>공모주(당사)</td><td>3615&nbsp;${company}(주)</td><td>2026/10/26~2026/10/27</td><td>2,000원</td><td>28.95 : 1</td><td>57.9 : 1</td><td>50,437</td></tr><tr><td>ELS</td><td>ELS123</td><td>2026/10/26~2026/10/27</td><td>1원</td><td>1 : 1</td><td>1 : 1</td><td>10</td></tr></table>${next?'<form id="contForm"><input name="isCont" value="Y"><input name="cnt" value="10"><input name="nk_pbof_sno" value="3615"><input name="nk_pbof_dscd" value="01"></form>':''}`;
test('대신 공모주(당사) 경쟁률 표만 읽고 처리결과 시각·ELS를 원본 집계로 쓰지 않음',()=>{
  const result=parseDaishinCompetition(daishinTable('테스트기업',true));
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].company,'테스트기업(주)');assert.equal(result.rows[0].proportionalRatio,57.9);assert.equal(result.rows[0].applications,50437);assert.equal(result.rows[0].subscribedShares,null);assert.equal(result.rows[0].sourceAsOf,null);assert.equal(result.next?.nk_pbof_sno,'3615');
  assert.throws(()=>parseDaishinCompetition('<html>로그인이 필요합니다.</html>'));
});
test('대신 월별 전 페이지 수집·동일 월 캐시, 반복 커서는 일부 결과를 성공으로 반환하지 않음',async()=>{
  let calls=0;
  const feed=createCompetitionFeed({now:()=>Date.parse('2026-10-26T03:00:00Z'),fetcher:async(_url,init)=>{
    calls++;const params=new URLSearchParams(String(init?.body));assert.equal(params.get('stand_date'),'202610');
    return new Response(params.get('isCont')==='Y'?daishinTable():daishinTable('다른기업',true));
  }});
  const input={...event,broker:'대신증권',disclosure:{...event.disclosure!,terms:undefined}};
  const result=await feed([input]);assert.equal(result.rows[0].proportionalRatio,57.9);assert.equal(result.rows[0].state,'delayed');assert.equal(calls,2);
  await feed([input]);assert.equal(calls,2);
  const looping=createCompetitionFeed({now:()=>Date.parse('2026-10-26T03:00:00Z'),fetcher:async()=>new Response(daishinTable('테스트기업',true))});
  const incomplete=await looping([input]);assert.equal(incomplete.rows[0].state,'unavailable');assert.equal(incomplete.rows[0].totalRatio,null);
});
test('종목+청약기간 일치, 시작 전·지연·종료 상태, 5분 캐시·장애 시 원래 수집 시각 유지',async()=>{
  let clock=Date.parse('2026-10-25T03:00:00Z'),calls=0,fail=false;
  const feed=createCompetitionFeed({now:()=>clock,fetcher:async()=>{calls++;if(fail)throw new Error();return Response.json({COMPETITION_RATE:[im]});}});
  const before=await feed([event]);assert.equal(before.rows[0].state,'not-started');
  const same=await feed([event]);assert.equal(calls,1);assert.equal(same.rows[0].fetchedAt,before.rows[0].fetchedAt);
  clock=Date.parse('2026-10-26T03:00:00Z');const live=await feed([event]);assert.equal(live.rows[0].state,'delayed');assert.equal(live.rows[0].delayMinutes,5);assert.equal(live.rows[0].sourceAsOf,null);
  const metrics=allocationMetrics(live.rows[0],1);assert.equal(metrics.equalAverage,50);assert.equal(metrics.deposit,4000000);assert.equal(metrics.costPerShare,8000);
  fail=true;clock+=301000;const stale=await feed([event]);assert.equal(stale.rows[0].stale,true);assert.equal(stale.rows[0].fetchedAt,live.rows[0].fetchedAt);
  clock=Date.parse('2026-10-28T03:00:00Z');assert.equal((await feed([event])).rows[0].state,'closed');
  const mismatched=await feed([{...event,start:'2026-10-25'}]);assert.equal(mismatched.rows[0].totalRatio,null);
  const unsupported=await feed([{...event,broker:'NH투자증권'}]);assert.equal(unsupported.rows[0].state,'unsupported');assert.equal(unsupported.rows[0].totalRatio,null);
});
test('가정 계산은 비례 이론배정·자금·단리이자를 계산하고 잘못된 입력·0분모를 거부',()=>{
  const result=subscriptionScenario({price:10000,shares:100,marginRate:0.5,ratio:20,fee:2000,annualRate:2.85,days:4})!;
  assert.equal(result.deposit,500000);assert.equal(result.proportionalShares,5);assert.equal(result.costPerShare,100000);assert.ok(Math.abs(result.interest-156.16438)<0.001);
  for(const ratio of [0,-1,Infinity,NaN])assert.equal(subscriptionScenario({price:10000,shares:100,marginRate:0.5,ratio,fee:0,annualRate:2.85,days:4}),null);
});
test('증권사 예정일을 달력·내보내기에 출처와 함께 연결하며 stale·불일치·기존 공시는 보호',async()=>{
  const feed=createCompetitionFeed({now:()=>Date.parse('2026-10-25T03:00:00Z'),fetcher:async()=>Response.json({COMPETITION_RATE:[im]})});
  const data=await feed([event]);assert.equal(isCompetitionResponse(data),true);
  const events=mergeBrokerDates([event],data);assert.equal(events.length,3);
  const listing=events.find(e=>e.kind==='listing')!;assert.equal(listing.start,'2026-11-04');assert.equal(listing.disclosure?.listing?.basis,'broker-announcement');assert.equal(listing.disclosure?.listing?.receiptNo,null);
  const ics=exportCalendar([listing]).replace(/\r\n /g,'');assert.match(ics,/URL:https:\/\/www.imfnsec.com/);assert.ok(ics.includes('증권사 공개 안내'));
  assert.equal(mergeBrokerDates([event],{...data,rows:data.rows.map(r=>({...r,stale:true}))}).length,1);
  assert.equal(mergeBrokerDates([event],{...data,rows:[data.rows[0],{...data.rows[0],listingDate:'2026-11-05'}]}).filter(e=>e.kind==='listing').length,0);
  const dated={...event,disclosure:{...event.disclosure!,listing:{date:'2026-11-06',quote:'공시',receiptNo:'20261022000123',sourceUrl:event.disclosure!.sourceUrl,basis:'explicit' as const}}};
  assert.equal(mergeBrokerDates([dated],data).find(e=>e.kind==='subscription')?.disclosure?.listing?.basis,'explicit');
  const existing={...dated,id:'d:listing',kind:'listing' as const,start:'2026-11-06',end:'2026-11-07'};
  assert.equal(mergeBrokerDates([dated,existing],data).find(e=>e.kind==='listing')?.start,'2026-11-06');
  assert.equal(isCompetitionResponse({...data,rows:[{...data.rows[0],totalRatio:NaN}]}),false);
});
