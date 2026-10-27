import { ExternalLink } from 'lucide-react';
import { offeringResults, type ScheduleEvent } from '../shared/schedule';

const ratio = (v: number) => `${v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} : 1`;
const percent = (v: number) => `${(v * 100).toLocaleString('ko-KR', { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;
const count = (v: number) => v.toLocaleString('ko-KR');
const shares = (v: number) => `${v.toLocaleString('ko-KR', { maximumFractionDigits: v < 10 ? 2 : 1 })}주`;

function Share({ label, value, note }: { label: string; value: number; note?: string }) {
  return <div className="result-share"><div><dt>{label}</dt><dd>{percent(value)}</dd></div>
    <span className="result-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, value * 100)}%` }} /></span>{note && <small>{note}</small>}</div>;
}
function Source({ href, label }: { href: string; label: string }) {
  return <a className="result-source" href={href} target="_blank" rel="noreferrer">{label} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (외부 페이지)</span></a>;
}

/** Book-building and subscription results as disclosed on DART. Absent values are left out. */
export function OfferingResults({ event }: { event: ScheduleEvent }) {
  const { demand, result } = offeringResults(event);
  if (!demand && !result) return null;
  return <div className="offering-results">
    {demand && <section className="result-card" aria-labelledby="result-demand">
      <div className="result-head"><h3 id="result-demand">기관 수요예측</h3><Source href={demand.sourceUrl} label="공시" /></div>
      <div className="result-hero"><span>기관 경쟁률</span><strong>{ratio(demand.ratio)}</strong><small>{count(demand.participants)}건 참여</small></div>
      <dl className="result-shares">
        {demand.aboveUpperShare !== null && <Share label="밴드 상단 이상 제시" value={demand.aboveUpperShare} note={demand.band ? `희망 공모가 ${count(demand.band.low)}~${count(demand.band.high)}원` : undefined} />}
        {demand.committedShare !== null && <Share label="의무보유 확약" value={demand.committedShare} note="신청 수량 기준" />}
      </dl>
    </section>}
    {result && <section className="result-card" aria-labelledby="result-subscription">
      <div className="result-head"><h3 id="result-subscription">청약 결과</h3><Source href={result.sourceUrl} label="공시" /></div>
      <div className="result-hero"><span>청약 경쟁률</span><strong>{ratio(result.ratio)}</strong><small>{count(result.applicants)}건 청약</small></div>
      <dl className="result-facts">
        <div><dt>균등 배정</dt><dd>평균 {shares(result.equalSharesPerApplicant)}</dd></div>
        {result.committedShare !== null && <div><dt>기관 확약</dt><dd>{percent(result.committedShare)}</dd></div>}
      </dl>
    </section>}
  </div>;
}
