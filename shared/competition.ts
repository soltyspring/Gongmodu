import {addDays,lastDay,type ScheduleEvent} from './schedule.ts';
export interface CompetitionRow {
  offeringId:string; company:string; broker:string;
  state:'not-started'|'delayed'|'closed'|'unavailable'|'unsupported';
  totalRatio:number|null; proportionalRatio:number|null; applications:number|null;
  subscribedShares:number|null; allocatedShares:number|null; equalShares:number|null;
  price:number|null; limitShares:number|null; refundDate:string|null; listingDate:string|null;
  sourceUrl:string|null; sourceName:string; sourceAsOf:string|null; fetchedAt:string|null;
  delayMinutes:number|null; stale:boolean; note:string;
}
export interface CompetitionResponse {rows:CompetitionRow[];fetchedAt:string;refreshAfterSeconds:number}
export function isCompetitionResponse(value:unknown):value is CompetitionResponse {
  const data=value as CompetitionResponse;
  return !!data&&Array.isArray(data.rows)&&Number.isFinite(Date.parse(data.fetchedAt))&&data.rows.every(row=>{
    if(!row||typeof row.offeringId!=='string'||typeof row.company!=='string'||typeof row.broker!=='string'||!['not-started','delayed','closed','unavailable','unsupported'].includes(row.state))return false;
    if(!['totalRatio','proportionalRatio','applications','subscribedShares','allocatedShares','equalShares','price','limitShares','delayMinutes'].every(k=>{const n=row[k as keyof CompetitionRow];return n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0;}))return false;
    return (row.sourceUrl===null||typeof row.sourceUrl==='string'&&/^https:\/\//.test(row.sourceUrl))&&typeof row.sourceName==='string'&&typeof row.note==='string'&&typeof row.stale==='boolean'&&(row.fetchedAt===null||Number.isFinite(Date.parse(row.fetchedAt)))&&['refundDate','listingDate','sourceAsOf'].every(k=>{const d=row[k as keyof CompetitionRow];return d===null||typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d);});
  });
}
export function mergeBrokerDates(events:ScheduleEvent[],data:CompetitionResponse|null):ScheduleEvent[] {
  if(!data)return events;
  const result=[...events];
  for(const event of events.filter(e=>e.kind==='subscription'&&e.disclosure)) {
    for(const kind of ['refund','listing'] as const) {
      if(event.disclosure?.[kind])continue;
      if(result.some(e=>e.id===`${event.disclosure!.offeringId}:${kind}`))continue;
      const rows=data.rows.filter(r=>r.offeringId===event.disclosure!.offeringId&&!r.stale&&r.fetchedAt&&r.sourceUrl&&/^https:\/\/(?:www\.imfnsec\.com|www\.samsungpop\.com)\//.test(r.sourceUrl));
      const values=rows.map(r=>kind==='refund'?r.refundDate:r.listingDate).filter((s):s is string=>!!s);
      if(new Set(values).size!==1)continue;
      const day=values[0];
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||day<lastDay(event)||day>addDays(event.end,120))continue;
      const parsed=new Date(`${day}T12:00:00Z`);
      if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==day)continue;
      const row=rows.find(r=>(kind==='refund'?r.refundDate:r.listingDate)===day)!;
      const evidence={date:day,quote:`${row.sourceName}의 공개 청약 안내에 기재된 ${kind==='refund'?'환불일':'상장 예정일'}이에요. 앱 수집 시각: ${row.fetchedAt}`,receiptNo:null,sourceUrl:row.sourceUrl!,basis:'broker-announcement' as const};
      const end=addDays(day,1);
      const index=result.findIndex(e=>e.id===event.id);
      const disclosure={...result[index].disclosure!,[kind]:evidence};
      result[index]={...result[index],disclosure};
      result.push({...event,id:`${event.disclosure!.offeringId}:${kind}`,kind,title:`(${kind==='refund'?'환불':'상장 예정'}) ${event.company}`,start:day,end,startAt:`${day}T00:00:00+09:00`,endAt:`${end}T00:00:00+09:00`,description:evidence.quote,disclosure});
    }
  }
  return result.map(event=>{
    const subscription=result.find(e=>e.kind==='subscription'&&e.disclosure&&e.disclosure.offeringId===event.disclosure?.offeringId);
    return subscription?{...event,disclosure:subscription.disclosure}:event;
  }).sort((a,b)=>a.start.localeCompare(b.start)||a.company.localeCompare(b.company,'ko'));
}
export const positive = (value:number|null|undefined):value is number => typeof value==='number' && Number.isFinite(value) && value>0;
export function allocationMetrics(row:CompetitionRow,marginRate:number|null) {
  const equalAverage=positive(row.equalShares)&&positive(row.applications)?row.equalShares/row.applications:null;
  const deposit=positive(row.price)&&positive(row.subscribedShares)&&positive(marginRate)?row.price*row.subscribedShares*marginRate:null;
  const costPerShare=positive(row.price)&&positive(row.proportionalRatio)&&positive(marginRate)?row.price*row.proportionalRatio*marginRate:null;
  return {equalAverage,deposit,costPerShare};
}
export function subscriptionScenario(input:{price:number;shares:number;marginRate:number;ratio:number;fee:number;annualRate:number;days:number}) {
  const {price,shares,marginRate,ratio,fee,annualRate,days}=input;
  if(![price,shares,marginRate,ratio,fee,annualRate,days].every(Number.isFinite) || price<=0 || shares<=0 || !Number.isSafeInteger(shares) || marginRate<=0 || marginRate>1 || ratio<=0 || fee<0 || annualRate<0 || days<0)return null;
  const deposit=price*shares*marginRate;
  const proportionalShares=shares/ratio;
  const interest=deposit*(annualRate/100)*days/365;
  const costPerShare=price*marginRate*ratio;
  if(![deposit,proportionalShares,interest,costPerShare].every(Number.isFinite))return null;
  return {deposit,proportionalShares,interest,costPerShare,fee,totalCost:interest+fee};
}
