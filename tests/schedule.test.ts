import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule } from './helpers/ics.ts';
import { addDays, assignLanes, calendarCells, dateKey, exportCalendar, includesDate, lastDay, statusLabel } from '../shared/schedule.ts';

const calendar = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR\r\n`;
const event = (id: string, start: string, end: string, title = '(청약) 테스트기업 - 삼성 (10\\,000원~12\\,000원)') => `BEGIN:VEVENT\r\nUID:${id}\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:${title}\r\nEND:VEVENT`;

for (const timezone of ['Asia/Seoul', 'UTC', 'America/New_York']) {
  test(`date-only 청약 날짜와 exclusive 종료일 보존: ${timezone}`, () => {
    const before = process.env.TZ; process.env.TZ = timezone;
    try {
      const [e] = parseSchedule(calendar(event('a', '20261026', '20261028')));
      assert.equal(e.start, '2026-10-26'); assert.equal(e.end, '2026-10-28');
      assert.equal(lastDay(e), '2026-10-27'); assert.equal(includesDate(e, '2026-10-28'), false);
      assert.equal(statusLabel(e, '2026-10-25'), '내일');
      assert.equal(statusLabel(e, '2026-10-27'), '오늘 마감');
      assert.equal(statusLabel(e, '2026-10-28'), '종료');
      assert.equal(e.broker, '삼성'); assert.equal(e.priceText, '10,000원~12,000원');
    } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  });
}
test('UTC 시각은 한국 날짜에 배치하고, 자정에 끝나는 일정은 다음 날에 표시하지 않음', () => {
  const [e] = parseSchedule(calendar('BEGIN:VEVENT\r\nUID:timed\r\nDTSTART:20261025T160000Z\r\nDTEND:20261026T150000Z\r\nSUMMARY:(상장) 테스트기업\r\nEND:VEVENT'));
  assert.equal(e.start, '2026-10-26'); assert.equal(e.end, '2026-10-27');
  assert.equal(e.allDay, false); assert.equal(includesDate(e, '2026-10-27'), false);
});
test('취소 제외, 여러 줄 접기와 쉼표 이스케이프 복원, 금액을 증권사로 오인하지 않음', () => {
  const text = event('a', '20261026', '20261028', '(청약) 아이엠스팩1호 - 100억원') + '\r\n' + event('b', '20261026', '20261028').replace('END:VEVENT', 'STATUS:CANCELLED\r\nEND:VEVENT') + '\r\n' + event('c', '20261028', '20261029', '(상장) 길고긴\r\n 기업명 - NH\\, 삼성');
  const events = parseSchedule(calendar(text));
  assert.equal(events.length, 2); assert.equal(events[0].broker, null);
  assert.equal(events[1].company, '길고긴기업명'); assert.equal(events[1].broker, 'NH, 삼성');
});
test('겹치는 일정은 다른 차선을 쓰고, exclusive 종료 당일에는 차선을 재사용', () => {
  const events = parseSchedule(calendar([event('a','20261026','20261028'), event('b','20261027','20261029'), event('c','20261028','20261030')].join('\r\n')));
  const assigned = assignLanes(events);
  assert.deepEqual(assigned.map(x => x.lane), [0,1,0]);
});
test('월말, 윤년, 한국 기준 자정 경계를 유지', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dateKey(new Date('2026-10-24T16:00:00Z')), '2026-10-25');
  assert.equal(calendarCells('2026-10')[0], '2026-09-27');
  assert.equal(calendarCells('2026-10').length % 7, 0);
});
test('내보낸 ICS는 한글/개행/쉼표와 exclusive 종료일을 보존하고 75 octets 이하로 접음', () => {
  const events = parseSchedule(calendar(event('a','20261026','20261028','(청약) 긴기업이름'.repeat(10) + '\\, 상세내용')));
  const output = exportCalendar(events);
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  const parsed = parseSchedule(output);
  assert.equal(parsed[0].title, events[0].title); assert.equal(parsed[0].end, '2026-10-28');
});
test('잘못된 ICS 원문은 거부', () => {
  assert.throws(() => parseSchedule('<html>bad gateway</html>'));
});
