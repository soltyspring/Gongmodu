import { ExternalLink } from 'lucide-react';
import { companyReferences, type ScheduleEvent } from '../shared/schedule';
export default function CompanyInfo({event}:{event:ScheduleEvent}) {
  const candidate=event.disclosure?.companySummary;
  const summary=candidate&&/^\d{14}$/.test(candidate.receiptNo)&&candidate.sourceUrl===`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${candidate.receiptNo}`?candidate:null;
  const references=companyReferences(event);
  return <article className="company-info"><h2 className="detail-title">{event.company}</h2><p className="company-intro">증권신고서로 정리했어요</p><p className="small-note">공시의 핵심 문장과 재무 수치를 모았어요.</p>
    <section><h3>어떤 일을 하는 기업인가요?</h3><p>{summary?.overview||'사업 내용을 아직 정리하지 못했어요. 증권신고서의 사업 내용을 확인해 주세요.'}</p></section>
    <section><h3>어떻게 매출을 내나요?</h3><p>{summary?.revenueModel||'수익 구조를 명확히 확인하지 못했어요. 원문의 주요 제품과 매출 구성을 확인해 주세요.'}</p></section>
    <section><h3>최근 매출과 이익을 확인해요</h3>{summary?.financials.length?<><p className="small-note">{summary.scope} · 단위: {summary.unit}</p><div className="company-financials">{summary.financials.map(row=><div className="company-period" key={row.period}><h4>{row.period}</h4><dl><div><dt>매출</dt><dd>{row.revenue}</dd></div><div><dt>영업손익</dt><dd>{row.operatingProfit??'확인 전'}</dd></div>{row.netIncome!=null&&<div><dt>당기순이익</dt><dd>{row.netIncome}</dd></div>}</dl>{row.accounting&&<p className="small-note">{row.accounting}</p>}</div>)}</div><p className="small-note">괄호는 손실을 뜻해요. 반기·분기 수치는 연간 실적과 기간이 달라요. 회계 기준과 감사 여부는 원문에서 확인해 주세요.</p></>:<p>공시 원문에서 요약재무정보를 확인할 수 있어요.</p>}</section>
    {references.length>0&&<section className="company-references"><h3>기업 소개 자료도 살펴봐요</h3><p>IR 자료에서 주요 제품과 매출 구조를 자세히 볼 수 있어요.</p>{references.map((reference,i)=><a className="detail-source" key={reference.sourceUrl} href={reference.sourceUrl} target="_blank" rel="noreferrer">IRGO에서 기업 소개 자료 보기{references.length>1?` ${i+1}`:''} <ExternalLink size={15}/><span className="sr-only"> (외부 페이지)</span></a>)}</section>}
    {(summary||event.disclosure)&&<a className="detail-source" href={summary?.sourceUrl||event.disclosure!.sourceUrl} target="_blank" rel="noreferrer">요약에 사용한 증권신고서 <ExternalLink size={15}/><span className="sr-only"> (외부 페이지)</span></a>}
    <p className="small-note">과거 공시 기준의 참고 정보예요. 최신 정정 공시를 함께 확인해 주세요.</p>
  </article>;
}
