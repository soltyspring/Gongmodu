import { addDays, type DartDisclosure, type ScheduleEvent } from '../../shared/schedule.ts';
import type { DartDocument, DartGroup, DartReport, DartRow } from './client.ts';

function date(year: string, month: string, day: string) {
  const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(result)) return null;
  const parsed = new Date(`${result}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : null;
}
/** Accept unambiguous full dates only; never infer dates from payment/allocation days. */
export function parseDartDates(value: string): { start: string; last: string } | null {
  const matches = [...value.matchAll(/(?<!\d)(20\d{2})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?(?!\d)|(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g)];
  if (!matches.length || matches.length > 2) return null;
  const dates = matches.map(m => date(m[1] || m[4], m[2] || m[5], m[3] || m[6]));
  if (dates.some(d => !d)) return null;
  const start = dates[0]!, last = dates.at(-1)!;
  if (last < start || Date.parse(last) - Date.parse(start) > 14 * 86400000) return null;
  // A dangling range means a missing end date, not a single-day subscription.
  if (dates.length === 1 && /[~～∼]|부터|까지/.test(value)) return null;
  return { start, last };
}
const clean = (s: string | undefined) => s && !/^(?:-|해당사항\s*없음|미정|해당없음)$/.test(s.trim()) ? s.trim() : null;
const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))];
const rows = (groups: DartGroup[], title: string, receipt: string) => groups.filter(g => g.title.replace(/\s/g, '') === title).flatMap(g => g.list).filter(row => row.rcept_no === receipt);
const compact = (s: string) => s.replace(/\s/g, '');
const underwriterRole = /^(?:대표|공동|대표주관|공동주관|대표주관회사|공동주관회사|인수회사|주관회사|인수단)$/;
const brokerName = (value: string | undefined) => {
  const name = clean(value);
  return name && name.length <= 80 && /[가-힣A-Za-z]/.test(name) && !/^(?:구분|명칭|인수인|인수인명|합계|계)$/.test(compact(name)) ? name : null;
};
/** Use only identifiable underwriting tables in this receipt, never company-name guesses. */
export function documentUnderwriters(report: DartReport, document: DartDocument): DartRow[] {
  let latest: DartRow[] = [];
  for (const table of document.tables) {
    const headers = table.slice(0, 2).flat().map(compact);
    if (!headers.includes('인수금액') && !headers.includes('인수수량')) continue;
    if (!headers.includes('인수인') && !headers.includes('인수인명')) continue;
    const names = table.filter(row => underwriterRole.test(compact(row[0] || '')) && brokerName(row[1]));
    if (names.length) latest = names.map(row => ({ rcept_no: report.rcept_no, corp_code: report.corp_code,
      actsen: compact(row[0]), actnmn: brokerName(row[1])!, actnmn_source: 'document' }));
  }
  return latest;
}

export function ipoEvidence(text: string) {
  // Restrict evidence to the offering section, excluding the company's business/history.
  const headings = [...text.matchAll(/(?:^|\n)\s*(?:제\s*1\s*부\s*)?모집\s*또는\s*매출에\s*관한\s*사항\s*(?:\n|$)/g)];
  const generalHeadings = [...text.matchAll(/(?:^|\n)\s*[IⅠ1]+[.．]\s*모집\s*또는\s*매출에\s*관한\s*일반사항\s*(?:\n|$)/g)];
  const start = generalHeadings.at(-1)?.index ?? headings.at(-1)?.index ?? -1;
  const section = (start >= 0 ? text.slice(start) : text).split(/제\s*2\s*부\s*발행인에\s*관한\s*사항/)[0].slice(0, 100000);
  const compact = section.replace(/\s/g, '');
  if (/비상장(?:을|상태를)유지|상장계획이없|상장을추진하지않/.test(compact)) return false;
  return /상장공모/.test(compact) || /(?:코스닥|유가증권|코넥스)시장(?:에|의)?(?:신규)?상장(?:을)?(?:위한|예정|하고자|을통해)/.test(compact);
}
/** Latest complete summary tables follow the before/after correction tables in a DART original. */
export function documentGroups(report: DartReport, document: DartDocument): DartGroup[] {
  const base = { rcept_no: report.rcept_no, corp_code: report.corp_code, corp_name: report.corp_name };
  let general: Record<string,string> | null = null;
  let securities: Record<string,string>[] = [];
  const normalize = (s: string) => s.replace(/\s/g,'');
  for (const table of document.tables) {
    for (let i = 0; i < table.length - 1; i++) {
      const headers = table[i].map(normalize), values = table[i+1];
      const sbd = headers.indexOf('청약기일');
      if (sbd >= 0 && headers.includes('납입기일') && values.length === headers.length && parseDartDates(values[sbd] || '')) {
        const value = (label: string) => values[headers.indexOf(label)] || '';
        general = { ...base, sbd: values[sbd], pymd: value('납입기일'), asand: value('배정공고일') };
      }
      const price = headers.indexOf('모집(매출)가액');
      if (price >= 0 && headers.includes('모집(매출)방법')) {
        securities = table.slice(i+1).filter(row => row.length === headers.length).map(row => ({...base, slprc:row[price], slmthn:row[headers.indexOf('모집(매출)방법')]}));
      }
    }
  }
  return general ? [{ title:'일반사항', list:[general] }, {title:'증권의종류',list:securities}, {title:'인수인정보',list:documentUnderwriters(report, document)}] : [];
}
export function originalDate(report: DartReport, text: string) {
  if (!/정정|발행조건확정|첨부추가/.test(report.report_nm)) return date(report.rcept_dt.slice(0,4), report.rcept_dt.slice(4,6), report.rcept_dt.slice(6,8));
  const near = text.match(/(?:정정대상\s*공시서류의\s*)?최초\s*제출일\s*[:：]?([\s\S]{0,90})/)?.[1];
  return near ? parseDartDates(near)?.start ?? null : null;
}
export type Normalization = { events: ScheduleEvent[]; reason?: string };
export function normalizeOffering(report: DartReport, groups: DartGroup[], document: DartDocument | string): Normalization {
  const text = typeof document === 'string' ? document : document.text;
  if (/철/.test(report.rm) || /철회/.test(report.report_nm)) return { events: [], reason: 'withdrawn' };
  if (/정/.test(report.rm)) return { events: [], reason: 'superseded' };
  const general = rows(groups, '일반사항', report.rcept_no);
  if (general.length !== 1 || general[0].corp_code !== report.corp_code) return { events: [], reason: 'summary_unmatched' };
  const securities = rows(groups, '증권의종류', report.rcept_no);
  if (securities.some(r => /주주배정|제3자배정|주주우선/.test(r.slmthn || ''))) return { events: [], reason: 'not_ipo' };
  if (!ipoEvidence(text)) return { events: [], reason: 'ipo_unconfirmed' };
  const range = parseDartDates(general[0].sbd || '');
  const firstDate = originalDate(report, text);
  if (!range) return { events: [], reason: 'date_unconfirmed' };
  if (!firstDate) return { events: [], reason: 'lineage_unconfirmed' };
  const id = `dart:${report.corp_code}:${firstDate}`;
  let underwriters = rows(groups, '인수인정보', report.rcept_no).filter(r => r.corp_code === report.corp_code && brokerName(r.actnmn));
  if (!underwriters.length && typeof document !== 'string') underwriters = documentUnderwriters(report, document);
  const broker = unique(underwriters.map(r => brokerName(r.actnmn))).join(', ') || null;
  const brokerSource = !broker ? 'unconfirmed' : underwriters.every(r => r.actnmn_source === 'document') ? 'document' : 'summary';
  const prices = unique(securities.map(r => clean(r.slprc)));
  const priceText = prices.length === 1 ? prices[0] : null;
  const sourceUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rcept_no}`;
  const filingDate = date(report.rcept_dt.slice(0,4), report.rcept_dt.slice(4,6), report.rcept_dt.slice(6,8))!;
  const disclosure: DartDisclosure = {
    offeringId: id, corpCode: report.corp_code, receiptNo: report.rcept_no, reportName: report.report_nm,
    filedOn: filingDate, originalFiledOn: firstDate, sourceUrl, priceLabel: '모집(매출)가액',
    subscriptionText: general[0].sbd, paymentText: clean(general[0].pymd), allocationText: clean(general[0].asand),
    corrected: /정정|발행조건확정/.test(report.report_nm), brokerSource,
  };
  const end = addDays(range.last, 1);
  return { events: [{ id: `${id}:subscription`, title: `(청약) ${report.corp_name}`, company: report.corp_name, kind: 'subscription',
    start: range.start, end, allDay: true, startAt: `${range.start}T00:00:00+09:00`, endAt: `${end}T00:00:00+09:00`,
    broker, priceText, description: `${report.report_nm}\n공시 청약기일: ${general[0].sbd}`, updatedAt: null, disclosure,
  }] };
}
/** Keep the latest receipt within a confirmed offering, preserving stable bookmark/export IDs. */
export function latestOfferings(events: ScheduleEvent[]) {
  const latest = new Map<string, ScheduleEvent>();
  for (const event of events) {
    const previous = latest.get(event.id);
    if (!previous || event.disclosure!.receiptNo > previous.disclosure!.receiptNo) latest.set(event.id, event);
  }
  return [...latest.values()].sort((a, b) => a.start.localeCompare(b.start) || a.company.localeCompare(b.company, 'ko'));
}
