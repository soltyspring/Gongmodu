export type EventKind = 'subscription' | 'listing' | 'refund' | 'other';
export interface DateEvidence {
  date: string; quote: string; receiptNo: string | null; sourceUrl: string;
  basis: 'explicit' | 'payment-reference' | 'broker-announcement';
}
export interface SubscriptionClose {
  time: string; broker: string; receiptNo: string; sourceUrl: string;
}
export interface CompanySummary {
  overview:string|null; revenueModel:string|null;
  financials:{period:string;revenue:string;operatingProfit:string|null;accounting:string|null}[];
  unit:string|null; scope:string; receiptNo:string; sourceUrl:string;
}
export interface BrokerTerms {
  broker: string; allocatedShares: number | null; equalShares: number | null;
  marginRate: number | null; minShares: number | null; limitShares: number | null;
  feeText: string | null; eligibilityText: string | null;
  units: { from: number; to: number | null; step: number }[];
  sourceUrl: string; receiptNo: string;
  additionalSourceUrls?: string[];
}
export interface OfferingTerms {
  pricePerShare: number | null; priceConfirmed: boolean; brokers: BrokerTerms[];
}
export interface DartDisclosure {
  offeringId: string; corpCode: string; receiptNo: string; reportName: string;
  filedOn: string; originalFiledOn: string; sourceUrl: string; priceLabel: string;
  subscriptionText: string; paymentText: string | null; allocationText: string | null; corrected: boolean;
  brokerSource?: 'summary' | 'document' | 'unconfirmed';
  ipoEvidence?: { receiptNo: string; sourceUrl: string };
  refund?: DateEvidence | null; listing?: DateEvidence | null;
  subscriptionClose?: SubscriptionClose | null;
  companySummary?: CompanySummary;
  terms?: OfferingTerms;
}
export interface ScheduleEvent {
  id: string;
  title: string;
  company: string;
  kind: EventKind;
  start: string;
  /** Exclusive date: this day is NOT part of the event. */
  end: string;
  broker: string | null;
  priceText: string | null;
  description: string;
  updatedAt: string | null;
  allDay: boolean;
  startAt: string;
  endAt: string;
  disclosure?: DartDisclosure;
}
export interface ScheduleResponse {
  events: ScheduleEvent[];
  fetchedAt: string;
  stale: boolean;
  source: { name: string; url: string };
  coverage?: { from: string; to: string; reviewedReports: number; omittedReports: number; reasons: Record<string, number> };
  quality?: { missingBrokerCount: number; missingPriceCount: number; brokerReview: { eventId: string; company: string; receiptNo: string; sourceUrl: string }[] };
}
export const kindLabels: Record<EventKind, string> = {
  subscription: '청약', listing: '상장', refund: '환불', other: '기타',
};
export function isScheduleEvent(value: unknown): value is ScheduleEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as ScheduleEvent;
  return typeof e.id === 'string' && typeof e.company === 'string' && typeof e.title === 'string'
    && (!e.disclosure || (typeof e.disclosure.offeringId === 'string' && /^\d{8}$/.test(e.disclosure.corpCode) && /^\d{14}$/.test(e.disclosure.receiptNo) && e.disclosure.sourceUrl === `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${e.disclosure.receiptNo}`))
    && Object.hasOwn(kindLabels, e.kind) && typeof e.start === 'string' && typeof e.end === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(e.start) && /^\d{4}-\d{2}-\d{2}$/.test(e.end) && e.end > e.start
    && typeof e.allDay === 'boolean' && typeof e.startAt === 'string' && typeof e.endAt === 'string'
    && typeof e.description === 'string' && (typeof e.broker === 'string' || e.broker === null)
    && (typeof e.priceText === 'string' || e.priceText === null);
}
export const dateKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const lastDay = (event: ScheduleEvent) => addDays(event.end, -1);
export const includesDate = (event: ScheduleEvent, day: string) => event.start <= day && day < event.end;
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
export function dateRange(event: ScheduleEvent) {
  return event.start === lastDay(event) ? shortDate(event.start) : `${shortDate(event.start)} – ${shortDate(lastDay(event))}`;
}
export function statusLabel(event: ScheduleEvent, today: string) {
  if (event.end <= today) return '종료';
  if (includesDate(event, today)) {
    if (event.kind === 'refund') return '오늘 환불';
    if (event.kind === 'listing') return '오늘 상장';
    return lastDay(event) === today ? '오늘 마감' : '진행 중';
  }
  const diff = dayDiff(today, event.start);
  return diff === 1 ? '내일' : `D-${diff}`;
}
/** Only a verified source-bound deadline can end a subscription before its exclusive end date. */
export function verifiedCloseTime(event: ScheduleEvent): SubscriptionClose | null {
  const evidence = event.disclosure?.subscriptionClose;
  if (event.kind !== 'subscription' || !evidence || !event.disclosure || !/^\d{2}:\d{2}$/.test(evidence.time)) return null;
  const [hour, minute] = evidence.time.split(':').map(Number);
  if (hour > 23 || minute > 59 || evidence.receiptNo !== event.disclosure.receiptNo || evidence.sourceUrl !== event.disclosure.sourceUrl || evidence.broker !== event.broker) return null;
  return evidence;
}
export function isSubscriptionClosed(event: ScheduleEvent, now = Date.now()): boolean {
  const evidence = verifiedCloseTime(event);
  return !!evidence && now >= Date.parse(`${lastDay(event)}T${evidence.time}:00+09:00`);
}
/** Assign stable lanes to multi-day events, including across week boundaries. */
export function assignLanes(events: ScheduleEvent[]) {
  const ends: string[] = [];
  return [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.id.localeCompare(b.id)).map(event => {
    let lane = ends.findIndex(end => end <= event.start);
    if (lane === -1) lane = ends.length;
    ends[lane] = event.end;
    return { event, lane };
  });
}
export function calendarCells(month: string) {
  const first = `${month}-01`;
  const offset = new Date(`${first}T12:00:00Z`).getUTCDay();
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  const count = Math.ceil((offset + next.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(first, i - offset));
}
export function changeMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export function exportCalendar(events: ScheduleEvent[]) {
  const escape = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // RFC 5545: fold long lines at <=75 octets without splitting UTF-8 characters.
  const fold = (line: string) => {
    let result = '', bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 74) { result += '\r\n '; bytes = 1; }
      result += char; bytes += size;
    }
    return result;
  };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gongmoa//IPO Calendar//KO', 'CALSCALE:GREGORIAN',
    ...events.flatMap(event => {
      const evidence=event.kind==='refund'?event.disclosure?.refund:event.kind==='listing'?event.disclosure?.listing:null;
      const provenance=evidence?.basis==='broker-announcement'?'증권사 공개 안내의 예정 일정이에요.':`DART 공시 기반 일정이에요. 접수번호: ${evidence?.receiptNo??event.disclosure?.receiptNo}.`;
      return [
      'BEGIN:VEVENT', `UID:${escape(event.id)}`, `DTSTAMP:${stamp}`,
      event.allDay ? `DTSTART;VALUE=DATE:${event.start.replaceAll('-', '')}` : `DTSTART:${event.startAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      event.allDay ? `DTEND;VALUE=DATE:${event.end.replaceAll('-', '')}` : `DTEND:${event.endAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `SUMMARY:${escape(event.title)}`, `DESCRIPTION:${escape(event.disclosure ? `${provenance} 내보낸 파일은 자동 업데이트되지 않아요. 원문을 다시 확인해 주세요.` : '이전 Google 캘린더에서 저장한 일정이에요. DART에서 확인한 일정이 아니에요. 청약 전 원문을 다시 확인해 주세요.')}`,
      ...(event.disclosure ? [`URL:${evidence?.sourceUrl??event.disclosure.sourceUrl}`] : []),
      'END:VEVENT',
    ];}), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
