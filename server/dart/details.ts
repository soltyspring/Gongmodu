import { lastDay, type BrokerTerms, type DateEvidence, type OfferingTerms, type ScheduleEvent, type SubscriptionClose } from '../../shared/schedule.ts';
import type { DartDocument } from './client.ts';
import { parseDartDates } from './normalize.ts';

const compact = (s: string) => s.replace(/\s/g, '');
export const brokerKey = (s: string) => compact(s).replace(/주식회사|\(주\)|㈜/g, '').replace(/^iM/i, '아이엠');
const integer = (s: string) => /^\d[\d,]*$/.test(s.trim()) && Number.isSafeInteger(Number(s.replaceAll(',', ''))) ? Number(s.replaceAll(',', '')) : null;
const scalar = (s: string) => integer(s.replace(/주|원|\s/g, ''));
export function offeringScope(document: DartDocument) {
  const general = [...document.text.matchAll(/(?:^|\n)\s*[IⅠ1]+[.．]\s*모집\s*또는\s*매출에\s*관한\s*일반사항\s*(?:\n|$)/g)];
  const start = general.at(-1)?.index ?? 0;
  const endMatch = /제\s*2\s*부\s*발행인에\s*관한\s*사항/.exec(document.text.slice(start));
  const end = endMatch ? start + endMatch.index : document.text.length;
  return { text: document.text.slice(start, end), tables: document.tables.filter((_, i) => !document.tableOffsets || document.tableOffsets[i] >= start && document.tableOffsets[i] < end) };
}
export function fullOffering(document: DartDocument) {
  return /청약증거금의\s*대체|청약증거금\s*대체|배정결과의\s*통지/.test(offeringScope(document).text.replace(/\n/g, ' '));
}
export interface DetailSource { document: DartDocument; receiptNo: string }

/** Strictly match a general-investor date and time range in this exact filing. */
export function disclosedSubscriptionClose(source: DetailSource, event: ScheduleEvent): SubscriptionClose | null {
  if (!event.broker || event.broker.split(/[,，]/).length !== 1 || !event.disclosure || source.receiptNo !== event.disclosure.receiptNo) return null;
  const text = offeringScope(source.document).text.replace(/\s+/g, ' ');
  const pattern = /일반청약자\s*청약일\s*[:：]\s*(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[~～∼]\s*(?:(20\d{2})\s*년\s*)?(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일\s*(?:\([^)]{0,20}?\s*)?(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:부터)?\s*[~～∼-]\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:까지)?/g;
  const date = (y: string, m: string, d: string) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const found = [...text.matchAll(pattern)].map(m => ({ start:date(m[1], m[2], m[3]), last:date(m[4] || m[1], m[5] || m[2], m[6]), startHour:Number(m[7]), startMinute:Number(m[8]), endHour:Number(m[9]), endMinute:Number(m[10]) }));
  if (!found.length || found.some(v => v.start !== event.start || v.last !== lastDay(event) || v.startHour > 23 || v.endHour > 23 || v.startMinute > 59 || v.endMinute > 59 || v.startHour * 60 + v.startMinute >= v.endHour * 60 + v.endMinute)) return null;
  const times = [...new Set(found.map(v => `${String(v.endHour).padStart(2,'0')}:${String(v.endMinute).padStart(2,'0')}`))];
  // A separate channel-specific deadline would make a single issuer-wide time misleading.
  if (times.length !== 1 || /(?:온라인|영업점|지점|채널)\s*(?:별|마다)\s*(?:청약)?\s*(?:시간|마감)/.test(text) || /(?:온라인|영업점|지점|HTS|MTS|ARS)[^。.;]{0,40}\d{1,2}\s*[:：]\s*\d{2}\s*(?:부터)?\s*[~～∼-]\s*\d{1,2}\s*[:：]\s*\d{2}/i.test(text)) return null;
  return { time: times[0], broker:event.broker, receiptNo:source.receiptNo, sourceUrl:event.disclosure.sourceUrl };
}
export function disclosedDates(source: DetailSource, paymentText: string | null) {
  const {text,tables} = offeringScope(source.document);
  const flattened = text.replace(/\s+/g,' ');
  const sourceUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${source.receiptNo}`;
  const candidates: Record<'refund'|'listing', {date:string;quote:string;basis:DateEvidence['basis']}[]> = {refund:[],listing:[]};
  const labels = {
    refund: /^(?:배정및)?환불(?:일|기일)?$|^청약(?:증거금|금)?(?:의)?(?:환불|반환)(?:일|기일)$|^환불및납입(?:일)?$/,
    listing: /^(?:신규)?상장(?:예정)?일$|^상장\(예정\)일$|^매매개시(?:예정)?일$/,
  };
  const add = (kind:'refund'|'listing',value:string,quote:string,basis:DateEvidence['basis']='explicit') => {
    const range = parseDartDates(value);
    if (range && range.start === range.last) candidates[kind].push({date:range.start,quote:quote.slice(0,260),basis});
  };
  for (const table of tables) for(let i=0;i<table.length;i++) {
    const row=table[i];
    for(const kind of ['refund','listing'] as const) for(let j=0;j<row.length;j++) {
      if (!labels[kind].test(compact(row[j]))) continue;
      if (j===0 && row.length<=3) add(kind,row.slice(1).join(' '),row.join(' '));
      // Column headers named 상장일 belong to peer, return-history or lock-up tables, never this issuer.
      else if(kind==='refund' && table[i+1]?.length===row.length && !row.some(c=>/회사명|기업명/.test(c))) add(kind,table[i+1][j],`${row[j]}: ${table[i+1][j]}`);
    }
  }
  // Refund clauses explicitly connecting a date to excess subscription money.
  for(const m of flattened.matchAll(/(?:초과\s*청약(?:증거)?금|환불일)[\s\S]{0,170}?(?:환불합니다|반환합니다|반환할\s*예정|환불할\s*예정)/g)) add('refund',m[0],m[0]);
  const relation = flattened.match(/초과\s*청약(?:증거)?금[^。]{0,90}?주금납입기일\s*(?:당일)?\s*(?:에|로)[^。]{0,25}?(?:환불|반환)합니다/);
  if(relation && paymentText) add('refund',paymentText,relation[0],'payment-reference');
  // Narrative listing dates must name this issuer; peer-company/history tables are excluded.
  const listingSentence=/(?:당사|동사|본\s*공모)[^。]{0,60}?(?:상장\s*(?:예정)?일|매매개시일)\s*[:：은는]*(?:\([^)]*\))?\s*(20\d{2}\s*(?:년|[.\/-])\s*\d{1,2}\s*(?:월|[.\/-])\s*\d{1,2}\s*일?)/g;
  for(const m of flattened.matchAll(listingSentence)) add('listing',m[1],m[0]);
  const result = (kind:'refund'|'listing'):DateEvidence|null => {
    const values=candidates[kind];
    if(new Set(values.map(v=>v.date)).size!==1) return null;
    return {...values.at(-1)!,receiptNo:source.receiptNo,sourceUrl};
  };
  return {refund:result('refund'),listing:result('listing')};
}

/** Fields stay null when ranges, customer tiers or multiple brokers cannot be resolved. */
export function offeringTerms(source:DetailSource, brokerNames:string[], rawPrice:string|null, priceConfirmed:boolean):OfferingTerms {
  const {text,tables}=offeringScope(source.document);
  const sourceUrl=`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${source.receiptNo}`;
  const brokers:BrokerTerms[]=brokerNames.map(broker=>({broker,allocatedShares:null,equalShares:null,marginRate:null,minShares:null,limitShares:null,feeText:null,eligibilityText:null,units:[],sourceUrl,receiptNo:source.receiptNo}));
  let context: BrokerTerms | undefined;
  for(const table of tables) {
    const title=table.flat().join(' ');
    if(table.length===1) context=brokers.find(b=>brokerKey(title).includes(brokerKey(b.broker))) ?? undefined;
    for(let i=0;i<table.length-1;i++) {
      const headers=table[i].map(compact);
      const allocation=headers.findIndex(h=>/^(?:일반청약자|일반투자자)배정(?:물량|수량)$/.test(h));
      const margin=headers.findIndex(h=>/^청약증거금(?:률|율)$/.test(h));
      const limit=headers.findIndex(h=>/^(?:최고)?청약한도/.test(h));
      if(allocation>=0 || margin>=0) for(const row of table.slice(i+1)) {
        if(row.length!==headers.length)continue;
        const broker=brokers.find(b=>brokerKey(row[0]).includes(brokerKey(b.broker))) ?? (brokers.length===1 && /일반청약자|일반투자자/.test(row[0]) ? brokers[0] : undefined);
        if(!broker)continue;
        if(allocation>=0)broker.allocatedShares=scalar(row[allocation]);
        if(limit>=0)broker.limitShares=scalar(row[limit].replace(/주\)|\(주\d+\)/g,''));
        if(margin>=0 && /^\s*(?:50|100)\s*%\s*$/.test(row[margin]))broker.marginRate=Number(row[margin].replace(/[%\s]/g,''))/100;
        context=broker;
      }
      if(headers.includes('청약주식수') && headers.includes('청약단위')) {
        const broker=context ?? (brokers.length===1?brokers[0]:undefined);
        if(!broker)continue;
        const units:BrokerTerms['units']=[];
        for(const row of table.slice(i+1)) {
          const numbers=[...(row[0]||'').matchAll(/[\d,]+/g)].map(m=>integer(m[0]));
          const step=scalar(row[1]||'');
          if(!numbers.length || numbers.some(n=>n===null) || !step || numbers.length>2)continue;
          const upperOnly=numbers.length===1 && /이하|미만/.test(row[0]);
          units.push({from:upperOnly?step:numbers[0]!+(/^[\d,]+주\s*초과/.test(row[0])?1:0),to:upperOnly?numbers[0]!-(/미만/.test(row[0])?1:0):numbers[1]??null,step});
        }
        if(units.length){broker.units=units;broker.minShares=units[0].from;}
      }
    }
  }
  if(brokers.length===1) {
    const flat=text.replace(/\s+/g,' ');
    const equal=[...flat.matchAll(/균등방식\s*최소배정\s*예정물량은\s*([\d,]+)\s*주/g)].at(-1);
    if(equal)brokers[0].equalShares=integer(equal[1]);
    // Keep eligibility as source text: do not turn one customer tier into a universal boolean.
    const eligibility=flat.match(/(?:청약당일|청약\s*당일|청약개시일)[^.。]{0,130}(?:개설|계좌)[^.。]{0,90}/);
    if(eligibility)brokers[0].eligibilityText=eligibility[0].slice(0,220);
    const feeTable=tables.find(t=>/청약수수료/.test(compact(t.flat().join(' '))) && /온라인|On-Line|HTS|MTS/.test(t.flat().join(' ')) && /\d[,\d]*원|면제/.test(t.flat().join(' ')));
    if(feeTable)brokers[0].feeText=feeTable.filter(row=>!row.some(c=>/출\s*고|배정기준/.test(c))).slice(0,6).map(row=>row.join(' · ')).join(' / ').slice(0,350);
  }
  return {pricePerShare:rawPrice?scalar(rawPrice):null,priceConfirmed,brokers};
}


/** The issue-results report (증권발행실적보고서) states the IPO's own trading start date. */
export function resultsReportListing(text:string):{date:string;quote:string}|null {
  const flat=text.replace(/\s+/g,' ');
  if(!/기업공개/.test(flat))return null;
  const found=[...flat.matchAll(/(?:신규\s*)?상장일\s*\(\s*매매개시일\s*\)\s*[:：]?\s*(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\(\s*예정\s*\))?/g)];
  const dates=[...new Set(found.map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`))];
  if(dates.length!==1||parseDartDates(dates[0])?.start!==dates[0])return null;
  return {date:dates[0],quote:found[0][0].trim().slice(0,160)};
}
