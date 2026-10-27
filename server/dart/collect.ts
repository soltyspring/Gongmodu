import { addDays, dateKey, type ScheduleResponse, type ScheduleEvent } from '../../shared/schedule.ts';
import { createDartClient, DartError, type DartDocument } from './client.ts';
import { documentGroups, latestOfferings, normalizeOffering, originalDate, parseDartDates } from './normalize.ts';
import { brokerKey, disclosedDates, disclosedSubscriptionClose, fullOffering, offeringScope, offeringTerms, resultsReportListing, type DetailSource } from './details.ts';
import { summarizeCompany } from './company.ts';

export const DART_SOURCE = { name: 'DART 증권신고서', url: 'https://dart.fss.or.kr/dsac008/main.do' };
export async function collectDartSchedule(options: { key: string; fetcher?: typeof fetch; now?: () => number; lookbackDays?: number; delayMs?: number; progress?: (done: number, total: number) => void }): Promise<ScheduleResponse> {
  const now = options.now ?? Date.now;
  if (options.lookbackDays !== undefined && (!Number.isInteger(options.lookbackDays) || options.lookbackDays < 1 || options.lookbackDays > 365)) throw new DartError('DART_CONFIG_INVALID');
  const end = dateKey(new Date(now()));
  const start = addDays(end, -(options.lookbackDays ?? 180));
  const client = createDartClient(options.key, options.fetcher, options.delayMs);
  const reports = await client.reports(start, end);
  // corp_cls describes the issuer now. A completed IPO can already be K/Y;
  // verify the offering itself instead of dropping it because it has listed.
  const candidates = reports.filter(r => /증권신고서\s*\(지분증권\)/.test(r.report_nm) && !/철/.test(r.rm) && !/철회/.test(r.report_nm));
  const companies = [...new Set(candidates.map(r => r.corp_code))];
  if (companies.length > 500) throw new DartError('DART_SCAN_LIMIT');
  const events: ScheduleEvent[] = [];
  const omitted: Record<string, number> = {};
  let done = 0;
  for (const corp of companies) {
    const groups = await client.equity(corp, start, end);
    for (const report of candidates.filter(r => r.corp_code === corp)) {
      // Never match a company's old summary to a newer correction by company name alone.
      const exact = groups.some(g => g.title.replace(/\s/g, '') === '일반사항' && g.list.some(row => row.rcept_no === report.rcept_no));
      const securityRows = groups.filter(g => g.title.replace(/\s/g, '') === '증권의종류').flatMap(g => g.list).filter(row => row.rcept_no === report.rcept_no);
      if (securityRows.some(row => /주주배정|제3자배정|주주우선/.test(row.slmthn || ''))) continue;
      let document: DartDocument;
      try { document = await client.document(report.rcept_no); }
      catch (error) {
        if (!(error instanceof DartError) || error.code !== 'DART_014') throw error;
        omitted.document_unavailable = (omitted.document_unavailable || 0) + 1;
        continue;
      }
      const latestGroups = exact ? groups : documentGroups(report, document);
      if (!latestGroups.length) { omitted.summary_unmatched = (omitted.summary_unmatched || 0) + 1; continue; }
      let result = normalizeOffering(report, latestGroups, document);
      let verifiedBase: DetailSource | undefined;
      const firstDate = originalDate(report, document.text);
      if (result.reason === 'ipo_unconfirmed' && firstDate && !fullOffering(document)) {
        const history = (await client.reports(firstDate, end, corp)).filter(r => r.corp_code === corp && r.rcept_no < report.rcept_no && /증권신고서\s*\(지분증권\)/.test(r.report_nm) && !/철회/.test(r.report_nm)).sort((a,b) => b.rcept_no.localeCompare(a.rcept_no));
        for (const previous of history.slice(0,6)) {
          let older: DartDocument;
          try { older = await client.document(previous.rcept_no); }
          catch(error) { if(error instanceof DartError && error.code === 'DART_014')continue;throw error; }
          if (originalDate(previous, older.text) !== firstDate || !fullOffering(older)) continue;
          verifiedBase = {document: older, receiptNo: previous.rcept_no};
          result = normalizeOffering(report, latestGroups, document, {...verifiedBase, originalFiledOn: firstDate});
          break;
        }
      }
      for(const event of result.events) {
        const disclosure=event.disclosure!;
        const latestSource:DetailSource={document,receiptNo:report.rcept_no};
        disclosure.subscriptionClose = disclosedSubscriptionClose(latestSource, event);
        let baseSource=verifiedBase ?? latestSource;
        // Some final-price filings contain only changed sections. Find the latest full
        // statement in the SAME original-filing lineage, rather than treating it as absent.
        if(!verifiedBase && !fullOffering(document)) {
          const history=(await client.reports(disclosure.originalFiledOn,end,corp)).filter(r=>r.corp_code===corp && r.rcept_no<report.rcept_no && /증권신고서\s*\(지분증권\)/.test(r.report_nm) && !/철회/.test(r.report_nm)).sort((a,b)=>b.rcept_no.localeCompare(a.rcept_no));
          for(const previous of history.slice(0,6)) {
            let older: DartDocument;
            try { older=await client.document(previous.rcept_no); }
            catch (error) { if(error instanceof DartError && error.code==='DART_014')continue;throw error; }
            if(originalDate(previous,older.text)===disclosure.originalFiledOn && fullOffering(older)) {baseSource={document:older,receiptNo:previous.rcept_no};break;}
          }
        }
        disclosure.companySummary=summarizeCompany(baseSource);
        const currentDates=disclosedDates(latestSource,disclosure.paymentText);
        const baseDates=disclosedDates(baseSource,disclosure.paymentText);
        const currentText=offeringScope(document).text.replace(/\s+/g,' ');
        const baseRange=documentGroups({...report,rcept_no:baseSource.receiptNo},baseSource.document).find(g=>g.title==='일반사항')?.list[0]?.sbd;
        const sameRange=JSON.stringify(parseDartDates(baseRange||''))===JSON.stringify(parseDartDates(disclosure.subscriptionText));
        const inherit=(kind:'refund'|'listing')=>{
          if(currentDates[kind])return currentDates[kind];
          if(baseSource===latestSource)return null;
          if(kind==='refund' && /환불(?:일|기일)|배정\s*및\s*환불|초과\s*청약(?:증거)?금.{0,100}(?:환불|반환)/.test(currentText))return null;
          if(kind==='listing' && /상장\s*(?:예정)?일\s*[:：]?\s*(?:미정|미확정|20\d{2})/.test(currentText))return null;
          const candidate=baseDates[kind];
          if(!candidate || (!sameRange && candidate.basis!=='payment-reference'))return null;
          return candidate;
        };
        disclosure.refund=inherit('refund');disclosure.listing=inherit('listing');
        // After subscription the issue-results report gives the actual trading start date.
        const last=addDays(event.end,-1);
        if(last<=end && last>=addDays(end,-60)) {
          const reports=(await client.resultsReports(corp,event.start,end)).filter(r=>r.rcept_dt>=event.start.replaceAll('-','') && r.rcept_dt<=addDays(last,20).replaceAll('-','')).sort((a,b)=>b.rcept_no.localeCompare(a.rcept_no));
          for(const filed of reports.slice(0,2)) {
            let results: DartDocument;
            try { results=await client.document(filed.rcept_no); }
            catch(error) { if(error instanceof DartError && error.code==='DART_014')continue;throw error; }
            const found=resultsReportListing(results.text);
            if(!found || found.date<last || found.date>addDays(last,60))continue;
            disclosure.listing={...found,receiptNo:filed.rcept_no,sourceUrl:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${filed.rcept_no}`,basis:'explicit'};
            break;
          }
        }
        const confirmed=/발행조건확정/.test(report.report_nm);
        const names=event.broker?.split(', ')??[];
        const baseTerms=offeringTerms(baseSource,names,event.priceText,confirmed);
        const currentTerms=offeringTerms(latestSource,names,event.priceText,confirmed);
        disclosure.terms={...baseTerms,brokers:baseTerms.brokers.map(b=>{
          const c=currentTerms.brokers.find(v=>brokerKey(v.broker)===brokerKey(b.broker));
          if(!c || baseSource===latestSource)return b;
          // Preserve the receipt for each inherited group; do not relabel an older source.
          return {...b,additionalSourceUrls:[c.sourceUrl],...(c.allocatedShares!==null?{allocatedShares:c.allocatedShares}:{}),...(c.marginRate!==null?{marginRate:c.marginRate}:{}),...(c.limitShares!==null?{limitShares:c.limitShares}:{}),...(c.units.length?{units:c.units,minShares:c.minShares}:{}),...(c.equalShares!==null?{equalShares:c.equalShares}:{}),...(c.feeText?{feeText:c.feeText}:{}),...(c.eligibilityText?{eligibilityText:c.eligibilityText}:{})};
        })};
      }
      events.push(...result.events);
      for(const subscription of result.events) for(const kind of ['refund','listing'] as const) {
        const evidence=subscription.disclosure?.[kind];
        const lastSubscription=addDays(subscription.end,-1);
        if(!evidence || evidence.date<lastSubscription || evidence.date>addDays(subscription.end,120))continue;
        const eventEnd=addDays(evidence.date,1);
        events.push({...subscription,id:`${subscription.disclosure!.offeringId}:${kind}`,kind,title:`(${kind==='refund'?'환불':'상장 예정'}) ${subscription.company}`,
          start:evidence.date,end:eventEnd,startAt:`${evidence.date}T00:00:00+09:00`,endAt:`${eventEnd}T00:00:00+09:00`,description:`DART 원문에 기재된 ${kind==='refund'?'환불':'상장 예정'} 일정\n${evidence.quote}\n근거 접수번호: ${evidence.receiptNo}`});
      }
      if (result.reason && !['not_ipo', 'withdrawn', 'superseded'].includes(result.reason)) omitted[result.reason] = (omitted[result.reason] || 0) + 1;
    }
    options.progress?.(++done, companies.length);
  }
  const latest = latestOfferings(events);
  const subscriptions=latest.filter(event=>event.kind==='subscription');
  const brokerReview = subscriptions.filter(event => !event.broker).map(event => ({ eventId: event.id, company: event.company,
    receiptNo: event.disclosure!.receiptNo, sourceUrl: event.disclosure!.sourceUrl }));
  return { events: latest, fetchedAt: new Date(now()).toISOString(), stale: false, source: DART_SOURCE,
    quality: { missingBrokerCount: brokerReview.length, missingPriceCount: subscriptions.filter(event => !event.priceText).length, brokerReview },
    coverage: { from: start, to: end, reviewedReports: candidates.length, omittedReports: Object.values(omitted).reduce((a,b) => a+b, 0), reasons: omitted },
  };
}
