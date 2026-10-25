import { addDays, dateKey, lastDay, type ScheduleEvent } from '../shared/schedule.ts';
import { type CompetitionRow, type CompetitionResponse } from '../shared/competition.ts';
import { brokerKey } from './dart/details.ts';
import { parseDartDates } from './dart/normalize.ts';
import { Parser } from 'htmlparser2';

export const IM_URL='https://www.imfnsec.com/mobile/common/competition_rate.html';
export const SAMSUNG_URL='https://www.samsungpop.com/ux/kor/banking/subscribe/stockpublic/inquiryView3.do';
export const DAISHIN_URL='https://www.daishin.com/g.ds?m=194&p=1031&v=681';
const number = (value:unknown):number|null=>{
  const s=String(value??'').replace(/\s|,/g,'');
  if(!/^\d+(?:\.\d+)?(?::1)?$/.test(s))return null;
  const n=Number(s.replace(':1',''));return Number.isFinite(n)&&n>=0&&n<=1e15?n:null;
};
const decode=(s:unknown)=>{try{return decodeURIComponent(String(s??'').replaceAll('+',' '));}catch{return '';}};
const companyKey=(s:string)=>brokerKey(s).replace(/_일반$|보통주|보통|\s/g,'');
const day=(s:unknown)=>{const d=parseDartDates(String(s??''));return d?.start===d?.last?d?.start??null:null;};
type OfficialRow={company:string;start:string;end:string;totalRatio:number|null;proportionalRatio:number|null;applications:number|null;subscribedShares:number|null;allocatedShares:number|null;price:number|null;limitShares:number|null;refundDate:string|null;listingDate:string|null;sourceAsOf:string|null;sourceUrl:string};
export function parseImCompetition(value:unknown):OfficialRow[] {
  const rows=(value as {COMPETITION_RATE?:unknown})?.COMPETITION_RATE;
  if(!Array.isArray(rows))throw new Error('BAD_RESPONSE');
  // In other display modes p_a58 is an all-investor allocation, not retail.
  return rows.filter(r=>decode(r.p_a52)==='공모주' && r.p_a68==='N' && /^\d{4}\/\d{2}\$\d+\$\d+\$\d+$/.test(r.p_a64||'')).flatMap(r=>{
    const start=day(r.p_a65),end=day(r.p_a66);if(!start||!end||start>end)return [];
    return [{company:decode(r.p_a55),start,end,totalRatio:number(r.p_a57),proportionalRatio:number(r.p_a67),applications:number(r.p_a60),subscribedShares:number(r.p_a59),allocatedShares:number(r.p_a58),price:number(r.p_a61),limitShares:number(r.p_a62),refundDate:day(r.p_a56),listingDate:day(r.p_a63),sourceAsOf:null,sourceUrl:`${IM_URL}?key=${r.p_a64}`}];
  });
}
export function parseSamsungCompetition(value:unknown):OfficialRow[] {
  const data=(value as any)?.data;
  if(data?.errorMsg || data?.trMsg || !Array.isArray(data?.result?.outRec2))throw new Error('BAD_RESPONSE');
  // The date view also contains institutional tranches; never show them as retail competition.
  return data.result.outRec2.filter((r:any)=>/_일반\s*$/.test(r.SBSN_ISUS_NAME||'')).flatMap((r:any)=>{
    const start=day(r.SBSN_STRT_DATE),end=day(r.SBSN_END_DATE);if(!start||!end||start>end)return [];
    return [{company:String(r.SBSN_ISUS_NAME).trim().replace(/_일반$/,''),start,end,totalRatio:number(r.A_SBSN_CMPT_RATE),proportionalRatio:number(r.A_PBLC_PRTN_PRPN_CMPT_RATE),applications:number(r.VLD_ACTC),subscribedShares:number(r.GNRL_SBSN_QNTY),allocatedShares:number(r.OWCM_GNRL_ALCN_QNTY),price:null,limitShares:null,refundDate:null,listingDate:null,sourceAsOf:day(r.PRCE_DATE),sourceUrl:SAMSUNG_URL}];
  });
}
export function parseDaishinCompetition(html:string) {
  const tables:string[][][]=[],stack:{rows:string[][];row:string[]|null;cell:string|null}[]=[];
  let continuation=false;const next:Record<string,string>={};
  const parser=new Parser({
    onopentag:(tag,attributes)=>{
      if(tag==='form')continuation=attributes.id==='contForm';
      if(continuation&&tag==='input'&&['isCont','cnt','nk_pbof_sno','nk_pbof_dscd'].includes(attributes.name)&&/^[A-Za-z\d]{1,20}$/.test(attributes.value||''))next[attributes.name]=attributes.value;
      if(tag==='table')stack.push({rows:[],row:null,cell:null});
      const c=stack.at(-1);if(c&&tag==='tr')c.row=[];if(c?.row&&(tag==='td'||tag==='th'))c.cell='';
    },ontext:value=>{const c=stack.at(-1);if(c?.cell!=null)c.cell+=value;},
    onclosetag:tag=>{
      if(tag==='form')continuation=false;
      const c=stack.at(-1);if(!c)return;
      if((tag==='td'||tag==='th')&&c.cell!==null){c.row?.push(c.cell.replace(/\s+/g,' ').trim());c.cell=null;}
      if(tag==='tr'&&c.row){c.rows.push(c.row);c.row=null;}
      if(tag==='table'){if(c.rows.length)tables.push(c.rows);stack.pop();}
    },
  },{decodeEntities:true});parser.end(html);
  const table=tables.find(t=>t.some(row=>row.includes('총 경쟁률')&&row.includes('비례경쟁률')&&row.includes('청약건수')));
  if(!table)throw new Error('BAD_RESPONSE');
  const rows:OfficialRow[]=table.filter(r=>r.length===7&&r[0]==='공모주(당사)').flatMap(r=>{
    const range=parseDartDates(r[2]);if(!range)return [];
    return [{company:r[1].replace(/^\w+\s+/,''),start:range.start,end:range.last,totalRatio:number(r[4]),proportionalRatio:number(r[5]),applications:number(r[6]),subscribedShares:null,allocatedShares:null,price:number(r[3].replace('원','')),limitShares:null,refundDate:null,listingDate:null,sourceAsOf:null,sourceUrl:DAISHIN_URL}];
  });
  return {rows,next:next.isCont==='Y'&&next.nk_pbof_sno&&next.nk_pbof_dscd&&next.cnt?next:null};
}

export function createCompetitionFeed(options:{fetcher?:typeof fetch;now?:()=>number;ttlMs?:number}={}) {
  const fetcher=options.fetcher??fetch,now=options.now??Date.now,ttl=options.ttlMs??300000;
  const cache=new Map<string,{rows:OfficialRow[];fetchedAt:string}>();
  const pending=new Map<string,Promise<{rows:OfficialRow[];fetchedAt:string;stale:boolean}|null>>();
  const attempts=new Map<string,number>();
  async function official(key:string,date:string) {
    const cached=cache.get(key);
    if(cached && now()-Date.parse(cached.fetchedAt)<ttl)return {...cached,stale:false};
    if(pending.has(key))return pending.get(key)!;
    if(now()-(attempts.get(key)??-Infinity)<60000) return cached?{...cached,stale:true}:null;
    const promise=(async()=>{
      attempts.set(key,now());
      const im=key==='im';
      if(key.startsWith('daishin:')) {
        const rows:OfficialRow[]=[];let cursor:Record<string,string>={};const cursors=new Set<string>();
        for(let page=0;page<10;page++){
          const response=await fetcher(DAISHIN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:DAISHIN_URL},body:new URLSearchParams({stand_date:date.slice(0,7).replace('-',''),...cursor}).toString(),signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw new Error('UNAVAILABLE');const html=await response.text();if(html.length>2000000)throw new Error('BAD_RESPONSE');
          const result=parseDaishinCompetition(html);rows.push(...result.rows);
          if(!result.next){const saved={rows,fetchedAt:new Date(now()).toISOString()};cache.set(key,saved);return {...saved,stale:false};}
          const token=JSON.stringify(result.next);if(cursors.has(token))throw new Error('BAD_PAGINATION');cursors.add(token);cursor=result.next;
        }
        throw new Error('PAGINATED');
      }
      const response=await fetcher(im?'https://www.imfnsec.com/common/heap/competition.json':'https://www.samsungpop.com/ux/kor/banking/subscribe/stockpublic/inquiryView3Data.do',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:im?IM_URL:SAMSUNG_URL},
        ...(im?{}:{body:new URLSearchParams({searchType:'date',SBSN_SECT_CODE:'5',SBSN_STRT_DATE:date.replaceAll('-',''),A_NXT_CONT:'',isNext:''}).toString()}),signal:AbortSignal.timeout(12000),
      });
      if(!response.ok)throw new Error('UNAVAILABLE');
      const raw=await response.text();if(raw.length>2000000)throw new Error('BAD_RESPONSE');
      const parsed=JSON.parse(raw);
      // An incomplete paginated response must not masquerade as complete coverage.
      if(!im && parsed?.data?.isNext==='NEXT')throw new Error('PAGINATED');
      const rows=im?parseImCompetition(parsed):parseSamsungCompetition(parsed);
      const result={rows,fetchedAt:new Date(now()).toISOString()};cache.set(key,result);return {...result,stale:false};
    })().catch(()=>cached?{...cached,stale:true}:null).finally(()=>pending.delete(key));
    pending.set(key,promise);return promise;
  }
  return async (events:ScheduleEvent[]):Promise<CompetitionResponse>=>{
    const today=dateKey(new Date(now()));
    const subscriptions=events.filter(e=>e.kind==='subscription'&&e.disclosure);
    const rows:CompetitionRow[]=[];
    for(const event of subscriptions)for(const broker of event.broker?.split(', ')??[]) {
      const disclosure=event.disclosure!;
      const terms=disclosure.terms?.brokers.find(b=>brokerKey(b.broker)===brokerKey(broker));
      const supported=brokerKey(broker)==='아이엠증권'?'im':brokerKey(broker)==='삼성증권'?'samsung':brokerKey(broker)==='대신증권'?'daishin':null;
      const row:CompetitionRow={offeringId:disclosure.offeringId,company:event.company,broker,state:supported?'unavailable':'unsupported',totalRatio:null,proportionalRatio:null,applications:null,subscribedShares:null,allocatedShares:terms?.allocatedShares??null,equalShares:terms?.equalShares??null,price:disclosure.terms?.priceConfirmed?disclosure.terms.pricePerShare:null,limitShares:terms?.limitShares??null,refundDate:disclosure.refund?.date??null,listingDate:disclosure.listing?.date??null,sourceUrl:supported==='im'?IM_URL:supported==='samsung'?SAMSUNG_URL:supported==='daishin'?DAISHIN_URL:null,sourceName:supported==='im'?'iM증권':broker,sourceAsOf:null,fetchedAt:null,delayMinutes:supported==='im'?5:null,stale:false,note:supported?'증권사 집계 정보를 확인하지 못했어요.':'이 증권사의 자동 수집은 아직 지원하지 않아요.'};
      if(!supported){rows.push(row);continue;}
      if(event.start>addDays(today,1)){row.state='not-started';row.note='청약 시작 전이에요. 시작일이 가까워지면 증권사 집계를 확인해요.';rows.push(row);continue;}
      // Limit historical requests; future offerings may have no public quote yet.
      if(lastDay(event)<addDays(today,-14)){row.note='최근 14일이 지난 청약의 경쟁률은 수집하지 않아요.';rows.push(row);continue;}
      const queryDate=lastDay(event)<today?lastDay(event):event.start>today?event.start:today;
      const result=await official(supported==='im'?'im':supported==='daishin'?`daishin:${queryDate.slice(0,7)}`:`samsung:${queryDate}`,queryDate);
      const matches=result?.rows.filter(r=>companyKey(r.company)===companyKey(event.company)&&r.start===event.start&&r.end===lastDay(event))??[];
      if(matches.length!==1){row.note='종목과 청약기간이 일치하는 증권사 집계가 아직 없어요.';rows.push(row);continue;}
      const match=matches[0];
      Object.assign(row,{totalRatio:match.totalRatio,proportionalRatio:match.proportionalRatio,applications:match.applications,subscribedShares:match.subscribedShares,allocatedShares:match.allocatedShares??row.allocatedShares,price:match.price??row.price,limitShares:match.limitShares??row.limitShares,refundDate:match.refundDate??row.refundDate,listingDate:match.listingDate??row.listingDate,sourceUrl:match.sourceUrl,sourceAsOf:match.sourceAsOf,fetchedAt:result!.fetchedAt,stale:result!.stale});
      row.state=today<event.start?'not-started':today>lastDay(event)?'closed':'delayed';
      row.note=row.state==='not-started'?'청약 시작 전이에요.':row.state==='closed'?'청약이 종료됐어요. 증권사 집계값이며 배정 확정치와 다를 수 있어요.':supported==='im'?'증권사에서 약 5분 지연으로 제공해요.':'증권사 집계값이에요. 원본 기준일을 함께 확인해 주세요.';
      if(match.sourceAsOf && match.sourceAsOf<queryDate){row.stale=true;row.note='요청한 날짜보다 이전의 집계값이에요.';}
      rows.push(row);
    }
    return {rows,fetchedAt:new Date(now()).toISOString(),refreshAfterSeconds:300};
  };
}
