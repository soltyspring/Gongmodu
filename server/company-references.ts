import { Parser } from 'htmlparser2';
import { addDays, dateKey, type ScheduleResponse, type CompanyReference } from '../shared/schedule.ts';

export const IRGO_INDEX='https://m.irgo.co.kr/IPO%EC%9E%90%EB%A3%8C';
const ORIGIN='https://m.irgo.co.kr';
const key=(name:string)=>name.replace(/주식회사|㈜|\(주\)|\s/g,'');
interface Card {company:string;title:string;date:string;url:string}
/** Discover links to original IR books only; never copy the book or its analysis. */
export function parseIrgoReferences(html:string):Card[] {
  const cards:Card[]=[];let depth=0,root=-1,field:'company'|'title'|'date'|null=null,card:Card|undefined;
  const parser=new Parser({onopentag:(tag,a)=>{
    if(tag==='div'){
      depth++;
      if(root<0&&/\bcard-template\b/.test(a.class??'')&&a['data-href']){root=depth;card={company:'',title:'',date:'',url:a['data-href']};}
    }
    if(card&&tag==='span')field=/\btxt-name\b/.test(a.class??'')?'company':/\btxt-title\b/.test(a.class??'')?'title':/\btxt-date\b/.test(a.class??'')?'date':null;
  },ontext:text=>{if(card&&field)card[field]+=text;},onclosetag:tag=>{
    if(tag==='span')field=null;
    if(tag==='div'){if(depth===root&&card){
      try{const url=new URL(card.url);if(url.origin===ORIGIN&&/^\/IPO자료\/\d+\/(?:TB|IC)\//.test(decodeURI(url.pathname))&&/\[IPO\].*(?:IR[ -]?BOOK|기업개요)/i.test(card.title))cards.push({...card,company:card.company.trim(),url:url.href});}catch{/* Ignore off-site links. */}
      card=undefined;root=-1;
    }depth--;}
  }},{decodeEntities:true});parser.end(html);return cards;
}
export function robotsAllowsReferences(text:string):boolean {
  // This source currently publishes an explicit global Allow: /. Fail closed if it changes.
  const groups=text.split(/(?=^User-agent:)/im).filter(s=>/^User-agent:/im.test(s));
  return groups.some(group=>/^User-agent:\s*\*\s*$/im.test(group)&&/^Allow:\s*\/\s*$/im.test(group)&&!/^Disallow:\s*\S+/im.test(group))
    && !groups.some(group=>/^User-agent:\s*(?:Gongmodu|\*)\s*$/im.test(group)&&/^Disallow:\s*\S+/im.test(group));
}
export async function enrichCompanyReferences(data:ScheduleResponse,fetcher:typeof fetch=fetch,now=Date.now()):Promise<ScheduleResponse>{
  const today=dateKey(new Date(now)),stamp=new Date(now).toISOString();
  const eligible=data.events.filter(event=>event.kind==='subscription'&&event.end>addDays(today,-30)&&event.start<addDays(today,60)&&event.disclosure);
  if(!eligible.length)return data;
  const read=async(url:string)=>{
    const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Gongmodu/1.0 (+https://github.com/soltyspring/Gongmodu)'}});
    if(!response.ok)throw new Error('IR_REFERENCE_UNAVAILABLE');
    const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>1_000_000)throw new Error('IR_REFERENCE_TOO_LARGE');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  };
  let cards:Card[];
  try{if(!robotsAllowsReferences(await read(`${ORIGIN}/robots.txt`)))return data;cards=parseIrgoReferences(await read(IRGO_INDEX));}catch{return data;}
  const references=new Map<string,CompanyReference[]>();
  for(const event of eligible){
    const matches=cards.filter(card=>key(card.company)===key(event.company)&&/IR[ -]?BOOK/i.test(card.title));
    const valid=matches.filter(card=>{
      if(/^\d{4}-\d{2}-\d{2}$/.test(card.date.trim()))return card.date.trim()>=event.disclosure!.originalFiledOn&&card.date.trim()<=today;
      const relative=card.date.trim().match(/^(\d+)(시간|일)전$/);
      if(!relative)return card.date.trim()==='방금전';
      const earliest=addDays(today,-(relative[2]==='일'?Number(relative[1]):Math.ceil(Number(relative[1])/24)));
      return earliest>=event.disclosure!.originalFiledOn;
    });
    const urls=[...new Set(valid.map(card=>card.url))].slice(0,2);
    if(urls.length)references.set(event.disclosure!.offeringId,urls.map(sourceUrl=>({company:event.company,sourceName:'IRGO',sourceUrl,fetchedAt:stamp})));
  }
  return {...data,events:data.events.map(event=>event.disclosure?{...event,disclosure:{...event.disclosure,companyReferences:references.get(event.disclosure.offeringId)??[]}}:event)};
}
