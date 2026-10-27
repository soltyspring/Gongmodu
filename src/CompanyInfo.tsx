import { Check, ChevronRight } from 'lucide-react';
import FinancialChart from './FinancialChart';
import { companyReport } from './company-report';
import type { Fact } from './detail-facts';
import { OfferingResults } from './OfferingResults';
import { companyReferences, type ScheduleEvent } from '../shared/schedule';

/** A one-screen IPO brief: offer terms, headline numbers, derived facts, business, trend, sources. */
export default function CompanyInfo({event, facts, price}:{event:ScheduleEvent; facts:Fact[]; price:string}) {
  const candidate=event.disclosure?.companySummary;
  const summary=candidate&&/^\d{14}$/.test(candidate.receiptNo)&&candidate.sourceUrl===`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${candidate.receiptNo}`?candidate:null;
  const references=companyReferences(event);
  const report=summary?companyReport(summary):{period:null,kpis:[],insights:[]};
  const offer=[{label:'공모가',value:price,known:!!event.priceText},...facts.filter(f=>f.label!=='마감 시간')];
  return <article className="company-report">
    <header className="report-hero">
      <p className="report-eyebrow">기업 리포트 · 증권신고서 기준</p>
      <h2 className="report-title">{event.company}</h2>
      {event.broker && <p className="report-broker">{event.broker} 주관</p>}
      <dl className="report-offer">{offer.map(item=><div key={item.label}><dt>{item.label}</dt><dd className={item.known?'':'is-unknown'}>{item.value}</dd></div>)}</dl>
    </header>

    <OfferingResults event={event} />

    {report.kpis.length>0&&<section className="report-card" aria-labelledby="report-kpi"><div className="report-card-head"><h3 id="report-kpi">실적 한눈에</h3><span>{report.period} · {summary!.scope}</span></div>
      <div className="report-kpis">{report.kpis.map(kpi=><div className="report-kpi" key={kpi.label}><span>{kpi.label}</span><strong className={`tone-${kpi.tone}`}>{kpi.value}</strong>{kpi.note&&<small className={`tone-${kpi.tone}`}>{kpi.note}</small>}</div>)}</div>
    </section>}

    {report.insights.length>0&&<section className="report-card" aria-labelledby="report-points"><h3 id="report-points">핵심 포인트</h3>
      <ul className="report-points">{report.insights.map(text=><li key={text}><Check size={18} aria-hidden="true"/>{text}</li>)}</ul>
    </section>}

    <section className="report-card" aria-labelledby="report-business"><h3 id="report-business">어떤 회사인가요?</h3>
      <div className="report-business">
        <div><span className="report-label">사업</span><p>{summary?.overview||'증권신고서의 사업 내용에서 확인할 수 있어요.'}</p></div>
        <div><span className="report-label">매출 구조</span><p>{summary?.revenueModel||'증권신고서의 주요 제품과 매출 구성에서 확인할 수 있어요.'}</p></div>
      </div>
    </section>

    <section className="report-card" aria-labelledby="report-trend"><h3 id="report-trend">매출과 이익을 한눈에</h3>
      {summary?.financials.length?<FinancialChart summary={summary}/>:<p className="report-empty">증권신고서의 요약재무정보에서 확인할 수 있어요.</p>}
    </section>

    <section className="report-card report-sources" aria-labelledby="report-sources"><h3 id="report-sources">원문 자료</h3>
      {(summary||event.disclosure)&&<a href={summary?.sourceUrl||event.disclosure!.sourceUrl} target="_blank" rel="noreferrer"><span><strong>요약에 사용한 증권신고서</strong><small>DART 전자공시</small></span><ChevronRight size={20} aria-hidden="true"/><span className="sr-only"> (외부 페이지)</span></a>}
      {references.map((reference,i)=><a key={reference.sourceUrl} href={reference.sourceUrl} target="_blank" rel="noreferrer"><span><strong>IRGO에서 기업 소개 자료 보기{references.length>1?` ${i+1}`:''}</strong><small>회사가 공개한 IR 자료</small></span><ChevronRight size={20} aria-hidden="true"/><span className="sr-only"> (외부 페이지)</span></a>)}
    </section>
    <p className="report-disclaimer">공시를 정리한 참고 자료예요. 투자 권유가 아니며, 최신 정정 공시를 함께 확인해 주세요.</p>
  </article>;
}
