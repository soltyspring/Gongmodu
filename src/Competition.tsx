import { useEffect, useState, type CSSProperties } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { allocationMetrics, isCompetitionResponse, subscriptionScenario, type CompetitionResponse, type CompetitionRow } from '../shared/competition';
import { dayDiff, lastDay, type BrokerTerms, type ScheduleEvent } from '../shared/schedule';

const key=(s:string)=>s.replace(/\s|㈜|주식회사|\(주\)/g,'');
const fmt=(n:number|null|undefined,unit='',digits=0)=>n==null?'—':`${n.toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits})}${unit}`;
const stateLabels={ 'not-started':'청약 전', delayed:'증권사 집계', closed:'청약 종료', unavailable:'집계 미확인',unsupported:'자동 연동 미지원' };
export function useCompetition(enabled:boolean) {
  const [data,setData]=useState<CompetitionResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  async function refresh(){
    setLoading(true);setError('');
    try{const response=await fetch(`${import.meta.env.VITE_API_BASE_URL||''}/api/competition`);if(!response.ok)throw new Error();const value=await response.json();if(!isCompetitionResponse(value))throw new Error();setData(value);}
    catch{setError('증권사 집계를 불러오지 못했어요. 마지막 값이 있다면 확인 시각과 함께 보여드려요.');setData(previous=>previous?{...previous,rows:previous.rows.map(row=>({...row,stale:true}))}:null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(!enabled)return;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},300000);return()=>clearInterval(timer);},[enabled]);
  return {data,loading,error,refresh};
}
type Feed=ReturnType<typeof useCompetition>;
function termsFor(event:ScheduleEvent,broker:string){return event.disclosure?.terms?.brokers.find(b=>key(b.broker)===key(broker));}
export function CompetitionSnippet({event,feed}:{event:ScheduleEvent;feed:Feed}) {
  const rows=feed.data?.rows.filter(r=>r.offeringId===event.disclosure?.offeringId)??[];
  return <section className="detail-section competition-snippet"><div className="section-heading"><h3>증권사별 청약 현황</h3><a href="#competition">비교하기</a></div>{feed.loading&&!rows.length?<p className="small-note" role="status">증권사 집계를 확인하고 있어요.</p>:rows.map(row=><div key={row.broker} className="broker-live-row"><div><strong>{row.broker}</strong><span>{row.stale?'이전 집계':stateLabels[row.state]}</span></div><dl><div><dt>일반 경쟁률</dt><dd>{row.state==='not-started'?'청약 전':fmt(row.totalRatio,':1',2)}</dd></div><div><dt>청약건수</dt><dd>{row.state==='not-started'?'—':fmt(row.applications,'건')}</dd></div></dl>{row.listingDate && <p className="small-note">상장 예정 {row.listingDate} · {row.sourceName} 안내</p>}<p className="small-note">{row.note}</p></div>)}{feed.error&&<p role="alert" className="small-note">{feed.error}</p>}<a className="text-button" href="#competition">경쟁률·배정·필요금액 비교 <ExternalLink size={14}/></a></section>;
}
export function CompetitionView({events,today,feed}:{events:ScheduleEvent[];today:string;feed:Feed}) {
  const subscriptions=events.filter(e=>e.kind==='subscription');
  const sorted=[...subscriptions].sort((a,b)=>{
    const distance=(e:ScheduleEvent)=>e.end>today?Math.max(0,dayDiff(today,e.start)):1000+dayDiff(lastDay(e),today);
    return distance(a)-distance(b);
  });
  const [selection,setSelection]=useState<string[]>([]);
  const ids=selection.length?selection:sorted.slice(0,3).map(e=>e.id);
  const selected=sorted.filter(e=>ids.includes(e.id));
  const columns=selected.flatMap(event=>(event.broker?.split(', ')??['주관사 미확인']).map(broker=>({event,broker,terms:termsFor(event,broker),live:feed.data?.rows.find(r=>r.offeringId===event.disclosure?.offeringId&&key(r.broker)===key(broker))})));
  function toggle(id:string){const current=[...ids];if(current.includes(id)){if(current.length>1)setSelection(current.filter(v=>v!==id));}else if(current.length<3)setSelection([...current,id]);}
  const metric=(label:string,render:(c:typeof columns[number])=>React.ReactNode)=><tr key={label}><th scope="row">{label}</th>{columns.map((c,i)=><td key={i}>{render(c)}</td>)}</tr>;
  const metrics=(c:typeof columns[number])=>c.live?allocationMetrics(c.live,c.terms?.marginRate??null):null;
  const available=(r:CompetitionRow|undefined)=>r&&r.state!=='not-started';
  return <>
    <div className="competition-toolbar"><div><strong>청약 현황과 필요금액</strong><p>증권사 원본 집계와 공시 기준을 나란히 확인해요.</p></div><div className="competition-tools"><button className="secondary-button" onClick={()=>document.querySelector('.scenario-panel')?.scrollIntoView()}>가정 계산</button><button className="refresh-button" onClick={()=>void feed.refresh()} disabled={feed.loading}><RefreshCw size={16} className={feed.loading?'spinning':''}/>{feed.loading?'확인 중':'집계 새로고침'}</button></div></div>
    <details className="comparison-picker"><summary>비교 종목 {selected.length}개 선택 · 최대 3개</summary><div>{sorted.map(event=><label key={event.id}><input type="checkbox" checked={ids.includes(event.id)} disabled={!ids.includes(event.id)&&ids.length>=3} onChange={()=>toggle(event.id)}/><span>{event.company}<small>{event.start} ~ {lastDay(event)}</small></span></label>)}</div></details>
    {feed.error&&<div className="notice" role="alert">{feed.error}</div>}
    <section className="panel comparison-panel" aria-label="증권사별 청약 비교"><div className="comparison-scroll" tabIndex={0} aria-label="청약 비교 표"><table className="comparison-table" style={{'--comparison-cols':Math.max(columns.length,1)} as CSSProperties}><colgroup><col className="comparison-label-col"/>{columns.map((_,i)=><col key={i}/>)}</colgroup><thead><tr><th scope="col">비교 항목</th>{columns.map((c,i)=><th scope="col" key={i}><a href={`#competition/event/${encodeURIComponent(c.event.id)}`}>{c.event.company}</a><span>{c.broker}</span><small>{c.live?.stale?'이전 집계':c.live?stateLabels[c.live.state]:feed.loading?'확인 중':'집계 대기'}</small></th>)}</tr></thead><tbody>
      {metric('균등배정 참고수량',c=>available(c.live)&&metrics(c)?.equalAverage!=null?<strong className="comparison-lead">{fmt(metrics(c)?.equalAverage,'주',2)}</strong>:<span className="missing-value">—</span>)}
      {metric('일반 경쟁률',c=>c.live?.state==='not-started'?'청약 전':available(c.live)?fmt(c.live?.totalRatio,':1',2):'—')}
      {metric('비례 경쟁률',c=>available(c.live)?fmt(c.live?.proportionalRatio,':1',2):'—')}
      {metric('청약건수',c=>available(c.live)?fmt(c.live?.applications,'건'):'—')}
      {metric('청약 신청수량',c=>available(c.live)?fmt(c.live?.subscribedShares,'주'):'—')}
      {metric('일반 배정주식수',c=>fmt(c.live?.allocatedShares??c.terms?.allocatedShares,'주'))}
      {metric('균등 기준물량',c=>fmt(c.terms?.equalShares,'주'))}
      {metric('총 증거금 (계산)',c=>available(c.live)?fmt(metrics(c)?.deposit,'원'):'—')}
      {metric('비례 1주 필요증거금',c=>available(c.live)?fmt(metrics(c)?.costPerShare,'원'):'—')}
      {metric('공모가·모집가액',c=><>{fmt(c.live?.price??c.event.disclosure?.terms?.pricePerShare,'원')}<small>{c.event.disclosure?.terms?.priceConfirmed?'발행조건 확정':c.live?.price?'증권사 안내':'확정 여부 원문 확인'}</small></>)}
      {metric('청약 증거금률',c=>fmt(c.terms?.marginRate!=null?c.terms.marginRate*100:null,'%'))}
      {metric('최소 청약주수',c=>fmt(c.terms?.minShares,'주'))}
      {metric('최소 필요증거금',c=>c.terms?.minShares&&c.terms.marginRate&&c.event.disclosure?.terms?.pricePerShare? <>{fmt(c.terms.minShares*c.terms.marginRate*c.event.disclosure.terms.pricePerShare,'원')}<small>{c.event.disclosure.terms.priceConfirmed?'수수료 별도':'모집가액 기준 · 수수료 별도'}</small></>:'—')}
      {metric('청약한도',c=>fmt(c.live?.limitShares??c.terms?.limitShares,'주'))}
      {metric('청약기간',c=><>{c.event.start}<br/>{lastDay(c.event)}</>)}
      {metric('환불일',c=>c.live?.refundDate??c.event.disclosure?.refund?.date??'미확인')}
      {metric('상장 예정일',c=><>{c.live?.listingDate??c.event.disclosure?.listing?.date??'미확인'}{c.live?.listingDate&&!c.event.disclosure?.listing&&<small>증권사 안내</small>}</>)}
      {metric('청약 수수료·면제',c=><span className="comparison-text">{c.terms?.feeText??'고객 등급별 원문 확인'}</span>)}
      {metric('계좌·청약 자격',c=><span className="comparison-text">{c.terms?.eligibilityText??'증권사 안내 확인'}</span>)}
      {metric('원본 기준 시각',c=><>{c.live?.sourceAsOf??'시각 미제공'}{c.live?.sourceAsOf&&<small>시각 미제공</small>}{c.live?.delayMinutes!=null&&<small>약 {c.live.delayMinutes}분 지연</small>}</>)}
      {metric('앱 수집 시각',c=>c.live?.fetchedAt?new Date(c.live.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—')}
      {metric('집계 안내',c=><span className="comparison-text">{c.live?.note??'증권사 집계를 확인하고 있어요.'}</span>)}
      {metric('출처',c=><div className="comparison-sources">{c.live?.sourceUrl&&<a href={c.live.sourceUrl} target="_blank" rel="noreferrer">증권사 집계 <ExternalLink size={12}/></a>}{[...new Set([c.event.disclosure?.sourceUrl,c.terms?.sourceUrl,...(c.terms?.additionalSourceUrls??[])])].filter((s):s is string=>!!s).map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer">공시 근거 {i+1} <ExternalLink size={12}/></a>)}</div>)}
    </tbody></table></div><p className="comparison-note">균등배정 참고수량은 공시에 명시된 최소 균등배정 예정물량 ÷ 청약건수예요. 실제 배정·추첨 확률을 보장하지 않아요. 증권사별 집계 시점은 다를 수 있고, ‘—’는 확인하지 못한 값이에요.</p></section>
    <section className="competition-method"><h2>집계와 가정을 구분해요</h2><p>연동된 증권사 집계는 5분 간격으로 다시 확인해요. 현재 iM증권·삼성증권·대신증권을 지원하며, 다른 증권사는 공시 정보와 미지원 상태를 표시해요. 청약 전 수치는 경쟁률로 표시하지 않아요.</p><p>총 증거금 = 청약 신청수량 × 공모가 × 증거금률. 비례 1주 필요증거금 = 비례 경쟁률 × 공모가 × 증거금률. 최종 배정수량과는 달라질 수 있어요.</p></section>
    <ScenarioCalculator key={selected[0]?.id||'none'} event={selected[0]} terms={columns[0]?.terms} live={columns[0]?.live}/>
  </>;
}
function ScenarioCalculator({event,terms,live}:{event:ScheduleEvent|undefined;terms:BrokerTerms|undefined;live:CompetitionRow|undefined}) {
  const [price,setPrice]=useState(String(live?.price??event?.disclosure?.terms?.pricePerShare??''));
  const [shares,setShares]=useState(String(terms?.minShares??''));
  const [ratio,setRatio]=useState(''),[margin,setMargin]=useState(String(terms?.marginRate!=null?terms.marginRate*100:''));
  const [fee,setFee]=useState('0'),[rate,setRate]=useState('2.85');
  const [finalApplications,setFinalApplications]=useState(''),[finalShares,setFinalShares]=useState('');
  const refund=event?.disclosure?.refund?.date??live?.refundDate;
  const [days,setDays]=useState(String(event&&refund?dayDiff(lastDay(event),refund):''));
  const values={price:Number(price),shares:Number(shares),ratio:Number(ratio),marginRate:Number(margin)/100,fee:Number(fee),annualRate:Number(rate),days:Number(days)};
  const unit=terms?.units.find(u=>values.shares>=u.from&&(u.to==null||values.shares<=u.to));
  const unitInvalid=!!terms?.units.length&&(!unit||values.shares%unit.step!==0);
  const overLimit=terms?.limitShares!=null&&values.shares>terms.limitShares;
  const result=[price,shares,ratio,margin,days,fee,rate].every(v=>v.trim()!=='')&&!unitInvalid&&!overLimit?subscriptionScenario(values):null;
  const validCount=(s:string)=>Number.isSafeInteger(Number(s))&&Number(s)>0&&Number(s)<=1e12;
  const assumedEqual=terms?.equalShares&&validCount(finalApplications)?terms.equalShares/Number(finalApplications):null;
  const assumedDeposit=validCount(finalShares)&&values.price>0&&values.price<=1e9&&values.marginRate>0&&values.marginRate<=1?Number(finalShares)*values.price*values.marginRate:null;
  const assumedTotalRatio=validCount(finalShares)&&live?.allocatedShares?Number(finalShares)/live.allocatedShares:null;
  const input=(label:string,value:string,set:(s:string)=>void,suffix:string)=><label>{label}<span><input type="number" inputMode="decimal" min="0" value={value} onChange={e=>set(e.target.value)} aria-label={label}/><i>{suffix}</i></span></label>;
  return <section className="panel scenario-panel"><div className="section-heading"><h2>최종 경쟁률 가정 계산</h2><span className="quiet-label">{event?.company??'종목 선택 필요'}</span></div><p>첨부 표의 예상치처럼, 직접 입력한 비례 경쟁률을 기준으로 계산해요. 시장 예측값이 아니에요.</p><div className="scenario-form">
    {input('공모가 가정',price,setPrice,'원')}{input('청약주수',shares,setShares,'주')}{input('최종 비례 경쟁률 가정',ratio,setRatio,':1')}{input('증거금률 가정',margin,setMargin,'%')}{input('수수료 가정',fee,setFee,'원')}{input('연 이자율 가정',rate,setRate,'%')}{input('자금 사용기간',days,setDays,'일')}
  </div><details className="scenario-assumptions"><summary>최종 청약 규모도 가정하기</summary><div className="scenario-form">{input('최종 청약건수 가정',finalApplications,setFinalApplications,'건')}{input('최종 신청수량 가정',finalShares,setFinalShares,'주')}</div><dl className="scenario-results"><div><dt>가정 균등 참고수량</dt><dd>{fmt(assumedEqual,'주',2)}</dd></div><div><dt>가정 총 증거금</dt><dd>{fmt(assumedDeposit,'원')}</dd></div><div><dt>가정 일반 경쟁률</dt><dd>{fmt(assumedTotalRatio,':1',2)}</dd></div></dl></details>{unitInvalid&&<p role="alert" className="small-note">공시의 청약단위에 맞는 주수를 입력해 주세요.</p>}{overLimit&&<p role="alert" className="small-note">공시에 확인된 청약한도를 초과했어요.</p>}<dl className="scenario-results"><div><dt>필요 증거금</dt><dd>{fmt(result?.deposit,'원')}</dd></div><div><dt>비례 이론배정</dt><dd>{fmt(result?.proportionalShares,'주',2)}</dd></div><div><dt>비례 1주 필요증거금</dt><dd>{fmt(result?.costPerShare,'원')}</dd></div><div><dt>예상 이자</dt><dd>{fmt(result?.interest,'원')}</dd></div><div><dt>이자 + 수수료</dt><dd>{fmt(result?.totalCost,'원')}</dd></div></dl><p className="small-note">증거금 전액에 입력 이자율을 적용한 단리 계산이에요. 자금 사용기간은 청약 마감일부터 환불일까지를 초기값으로 쓰며 실제 입금일부터 바꿔 계산할 수 있어요. 균등배정·단수주·증권사 최종 배정 규칙은 반영하지 않아요.</p></section>;
}
