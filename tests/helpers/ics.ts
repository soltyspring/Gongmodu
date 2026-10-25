import ical from 'node-ical';
import { createHash } from 'node:crypto';
import { addDays, dateKey, type EventKind, type ScheduleEvent } from '../../shared/schedule.ts';

export function parseSchedule(body: string): ScheduleEvent[] {
  if (!body.includes('BEGIN:VCALENDAR') || !body.includes('END:VCALENDAR')) throw new Error('Invalid calendar');
  const calendar = ical.sync.parseICS(body);
  const result: ScheduleEvent[] = [];
  for (const item of Object.values(calendar)) {
    if (item.type !== 'VEVENT' || item.status === 'CANCELLED' || !item.start || !item.summary) continue;
    // The reference feed contains one-off events. Do not silently invent recurring IPO dates.
    if (item.rrule) continue;
    const allDay = item.datetype === 'date';
    // node-ical interprets VALUE=DATE in the SERVER's local timezone.
    // Preserve its local calendar components; converting to UTC shifts Korea dates back a day.
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = allDay ? localDate(item.start) : dateKey(item.start);
    const finish = item.end ?? new Date(item.start.getTime() + (allDay ? 86400000 : 3600000));
    let end = allDay ? localDate(finish) : dateKey(finish);
    if (!allDay && !new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(finish).startsWith('00:00:00')) end = addDays(end, 1);
    if (end <= start) end = addDays(start, 1);
    const title = String(item.summary).trim();
    const kind: EventKind = /청약/.test(title) ? 'subscription' : /상장/.test(title) ? 'listing' : /환불/.test(title) ? 'refund' : 'other';
    const withoutPrefix = title.replace(/^\s*[([（【](?:청약|상장|환불|수요예측)[)\]）】]\s*/, '').trim();
    const [company, ...details] = withoutPrefix.split(/\s+[-–]\s+/);
    const detail = details.join(' - ');
    const priceText = detail.match(/\([\d,]+원?\s*[~～–-]\s*[\d,]+원\)/)?.[0]?.slice(1, -1) ?? null;
    const brokerCandidate = detail.replace(/\([^)]*\)/g, '').replace(/\*.*$/, '').trim();
    const broker = brokerCandidate && !/^\d/.test(brokerCandidate) ? brokerCandidate : null;
    result.push({
      id: item.uid || createHash('sha256').update(`${title}:${start}`).digest('hex').slice(0, 24),
      title, company: company || title, kind, start, end, allDay,
      startAt: item.start.toISOString(), endAt: finish.toISOString(), broker, priceText,
      description: item.description ? String(item.description) : '',
      updatedAt: item.lastmodified instanceof Date ? item.lastmodified.toISOString() : null,
    });
  }
  return [...new Map(result.map(event => [event.id, event])).values()].sort((a, b) => a.start.localeCompare(b.start) || a.company.localeCompare(b.company, 'ko'));
}
