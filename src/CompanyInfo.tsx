import { ExternalLink } from 'lucide-react';
import FinancialChart from './FinancialChart';
import { companyReferences, type ScheduleEvent } from '../shared/schedule';
export default function CompanyInfo({event}:{event:ScheduleEvent}) {
  const candidate=event.disclosure?.companySummary;
  const summary=candidate&&/^\d{14}$/.test(candidate.receiptNo)&&candidate.sourceUrl===`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${candidate.receiptNo}`?candidate:null;
  const references=companyReferences(event);
  return <article className="company-info"><h2 className="detail-title">{event.company}</h2><p className="company-intro">증권신고서 기준</p>
    <section><h3>어떤 일을 하는 기업인가요?</h3><p>{summary?.overview||'증권신고서의 사업 내용에서 확인할 수 있어요.'}</p></section>
    <section><h3>어떻게 매출을 내나요?</h3><p>{summary?.revenueModel||'증권신고서의 주요 제품과 매출 구성에서 확인할 수 있어요.'}</p></section>
    <section><h3>매출과 이익을 한눈에</h3>{summary?.financials.length?<><p className="small-note">{summary.scope}</p><FinancialChart summary={summary}/></>:<p>증권신고서의 요약재무정보에서 확인할 수 있어요.</p>}</section>
    {references.length>0&&<section className="company-references"><h3>기업 소개 자료</h3>{references.map((reference,i)=><a className="detail-source" key={reference.sourceUrl} href={reference.sourceUrl} target="_blank" rel="noreferrer">IRGO에서 기업 소개 자료 보기{references.length>1?` ${i+1}`:''} <ExternalLink size={15}/><span className="sr-only"> (외부 페이지)</span></a>)}</section>}
    {(summary||event.disclosure)&&<a className="detail-source" href={summary?.sourceUrl||event.disclosure!.sourceUrl} target="_blank" rel="noreferrer">요약에 사용한 증권신고서 <ExternalLink size={15}/><span className="sr-only"> (외부 페이지)</span></a>}
    <p className="small-note">과거 공시 기준이에요. 최신 정정 공시도 함께 확인해 주세요.</p>
  </article>;
}
