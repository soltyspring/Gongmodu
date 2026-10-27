import { test, expect, type Page } from '@playwright/test';
import { parseSchedule } from '../helpers/ics';

// Synthetic fixtures are confined to automated tests; production always reads the live feed.
const body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + [
  ['a','20261026','20261028','(청약) 한빛테크 - 삼성 (10\\,000원~12\\,000원)'],
  ['b','20261026','20261027','(상장) 한빛테크 - 삼성'],
  ['c','20261027','20261029','(청약) 미래스팩1호 - NH'],
  ['d','20261028','20261029','(환불) 한빛테크 - 삼성'],
  ['e','20261102','20261104','(청약) 다음기업 - 미래'],
].map(([id, start, end, title]) => `BEGIN:VEVENT\r\nUID:${id}\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:${title}\r\nEND:VEVENT`).join('\r\n') + '\r\nEND:VCALENDAR';
const events = parseSchedule(body).map(event => ({ ...event, disclosure: { offeringId: event.company, corpCode:'12345678', receiptNo:'20261022000123', sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261022000123', reportName:'[기재정정]증권신고서(지분증권)', filedOn:'2026-10-22', originalFiledOn:'2026-09-17', priceLabel:'모집(매출)가액', subscriptionText:'2026년 10월 26일 ~ 2026년 10월 27일', paymentText:'2026년 10월 29일', allocationText:null, corrected:true } }));
const data = { events, fetchedAt: '2026-10-25T03:00:00Z', stale: false, source: { name: 'DART 증권신고서', url: 'https://dart.fss.or.kr/dsac008/main.do' } };
async function setup(page: Page) {
  await page.clock.install({ time: new Date('2026-10-25T03:00:00Z') });
  await page.route('**/api/schedule', route => route.fulfill({ json: data }));
  await page.route('**/api/competition', route => route.fulfill({ json: {rows:[],fetchedAt:data.fetchedAt,refreshAfterSeconds:300} }));
}

test('홈 캘린더 → 상세 → 저장 → 새로고침 → 관심 일정', async ({ page }) => {
  await setup(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('공모주 일정');
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '한빛테크', exact: true })).toBeVisible();
  await expect(dialog).toContainText('10.26 – 10.27');
  await expect(dialog).toContainText('10,000원~12,000원');
  await dialog.getByRole('button', { name: '한빛테크 상세 관심 저장' }).click();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await page.reload();
  await page.getByRole('link', { name: '관심 일정', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: '한빛테크 청약 관심 해제' })).toBeVisible();
  await expect(page.getByRole('button', { name: /내보내기/ })).toHaveCount(0);
  await page.getByRole('button', { name: '한빛테크 청약 관심 해제' }).click();
  await expect(page.getByText('기억해 둘 공모주를 모아보세요')).toBeVisible();
  expect(errors).toEqual([]);
});

test('홈 빠른 저장과 청약 준비 기록을 다시 방문해 확인하고 정정 시 새로 시작', async ({ page }) => {
  await setup(page); await page.goto('/');
  await page.getByRole('button', { name: '가까운 청약 관심 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: /내 관심 일정 한빛테크/ })).toBeVisible();
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).click();
  const checklist = page.getByRole('region', { name: '나의 청약 준비' });
  await checklist.getByRole('checkbox', { name: /계좌와 청약 자격/ }).check();
  await expect(checklist.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.reload();
  await expect(checklist.getByRole('checkbox', { name: /계좌와 청약 자격/ })).toBeChecked();
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: events.map(event => ({ ...event, disclosure: { ...event.disclosure, receiptNo: '20261026000123', sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261026000123' } })) } }));
  await page.reload();
  await expect(checklist.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('complementary', { name: '광고', exact: true })).toHaveCount(0);
});

test('월간 달력, exclusive 종료, 검색, 종류 필터, 스팩 제외, 월 이동', async ({ page }) => {
  await setup(page); await page.goto('/#calendar');
  await expect(page.locator('.page-topline')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '전체 일정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '일정 새로고침' })).toHaveCount(0);
  await page.getByRole('button', { name: '2026-10-26, 일정 2개', exact: true }).click();
  await expect(page.locator('.selected-list .event-row')).toHaveCount(2);
  await page.getByRole('button', { name: '2026-10-28, 일정 2개', exact: true }).click();
  await expect(page.locator('.selected-list')).not.toContainText('청약 · 삼성');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('textbox', { name: '종목명 또는 증권사 검색' }).fill('한빛');
  await expect(page.locator('.list-mode .event-row')).toHaveCount(3);
  await page.getByRole('button', { name: '청약', exact: true }).click();
  await expect(page.locator('.list-mode .event-row')).toHaveCount(1);
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.locator('.list-mode .event-row')).toHaveCount(2);
  await page.getByRole('checkbox', { name: '스팩 제외' }).check();
  await expect(page.locator('.list-mode .event-row')).toHaveCount(1);
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.locator('.list-mode')).toContainText('다음기업');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.locator('.list-mode')).toContainText('2026년 10월');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('홈 문구가 청약 시작과 마감 날짜에 맞게 바뀌어요', async ({ page }) => {
  await setup(page); await page.goto('/');
  const heading = page.locator('.featured-panel h2');
  await expect(heading).toHaveText('내일 청약이 시작돼요');
  await page.clock.setFixedTime(new Date('2026-10-26T03:00:00Z'));
  await page.reload();
  await expect(heading).toHaveText('지금 청약을 진행하고 있어요');
  await page.clock.setFixedTime(new Date('2026-10-27T03:00:00Z'));
  await page.reload();
  await expect(heading).toHaveText('오늘 마감 예정이에요');
  await expect(page.locator('.featured-company')).toHaveText('한빛테크');
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.reload();
  await expect(heading).toHaveText('곧 시작하는 청약이에요');
});

test('직접 상세 진입, Escape 닫기, 브라우저 뒤로 가기, 안내', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/schedule', async route => { await pending; await route.fulfill({ json: data }); });
  await page.goto('/#calendar/event/a');
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('저장된 일정을 불러오고 있어요');
  await expect(page.getByText('이 일정을 찾을 수 없어요')).toHaveCount(0);
  release();
  await expect(page.getByRole('dialog')).toContainText('한빛테크');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.locator('.event-open').first().click();
  await page.goBack(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '데이터 출처 및 이용 안내' }).click();
  await expect(page.getByRole('dialog')).toContainText('DART 증권신고서를 읽어와요');
  await page.getByRole('button', { name: '관심 일정 안내', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('자동 푸시 알림을 보내지 않아요');
});

test('조회 장애는 재시도하고 오래된 정상 데이터는 경고 없이 유지', async ({ page }) => {
  await setup(page);
  await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({ status: 502, json: { error: 'offline' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('일정을 불러오지 못했어요');
  await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [] } }));
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByText('새로운 청약을 기다리고 있어요')).toBeVisible();
  await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, stale: true } }));
  await page.getByRole('button', { name: '일정 새로고침' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.featured-company')).toContainText('한빛테크');
  await expect(page.getByRole('button', {name:'일정 새로고침'})).toContainText('10. 25.');
});

test('주관사 미확인은 누락 안내와 원문 확인 동선을 표시', async ({ page }) => {
  await setup(page);
  await page.unroute('**/api/schedule');
  const incomplete = { ...events[0], broker: null, priceText: null, disclosure: { ...events[0].disclosure, brokerSource: 'unconfirmed' } };
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [incomplete] } }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('주관사 확인이 필요한 일정이 1개');
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('주관사를 자동으로 확인하지 못했어요');
  await expect(dialog).toContainText('공시 원문 확인 필요');
  await dialog.getByText('공시와 날짜 확인 근거', { exact: true }).click();
  await dialog.getByText('원본 공시 정보 보기', { exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'DART 증권신고서 원문 열기' })).toHaveAttribute('href', incomplete.disclosure.sourceUrl);
});

test('원문으로 보완한 증권사명은 홈·검색·상세와 확인 근거에 반영', async ({ page }) => {
  await setup(page);
  await page.unroute('**/api/schedule');
  const enriched = { ...events[0], broker: '아이엠증권', disclosure: { ...events[0].disclosure, brokerSource: 'document' } };
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [enriched] } }));
  await page.goto('/');
  await expect(page.locator('.featured-broker')).toContainText('아이엠증권');
  await page.getByRole('link', { name: '전체 일정', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('textbox', { name: '종목명 또는 증권사 검색' }).fill('아이엠');
  await expect(page.locator('.list-mode .event-row')).toHaveCount(1);
  await page.locator('.event-open').click();
  await expect(page.getByRole('dialog')).toContainText('주관사는 이 공시의 원문 인수인 표에서 확인했어요');
});

test('보류한 경쟁률 화면과 수집 요청은 출시 앱에 노출하지 않음', async ({ page }) => {
  await setup(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/competition')) requests.push(request.url()); });
  await page.goto('/#competition');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('공모주 일정');
  await expect(page.getByRole('link', { name: '청약 비교', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).click();
  await expect(page.locator('.competition-snippet')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('DART 원문 환불 근거와 출처를 상세에서 확인하고 내보내기는 제공하지 않음',async({page})=>{
  await setup(page); await page.unroute('**/api/schedule');
  const evidence={date:'2026-10-29',quote:'초과 청약증거금은 2026년 10월 29일에 환불합니다.',basis:'explicit',receiptNo:'20261008000123',sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261008000123'};
  const disclosure={...events[0].disclosure,refund:evidence};
  const refund={...events[0],id:'refund-verified',kind:'refund',start:'2026-10-29',end:'2026-10-30',startAt:'2026-10-29T00:00:00+09:00',endAt:'2026-10-30T00:00:00+09:00',disclosure};
  await page.route('**/api/schedule',route=>route.fulfill({json:{...data,events:[{...events[0],disclosure},refund]}}));
  await page.goto('/#calendar/event/refund-verified');
  const dialog=page.getByRole('dialog');
  await dialog.getByText('공시와 날짜 확인 근거', {exact:true}).click();
  await expect(dialog).toContainText(evidence.quote);
  await expect(dialog.getByRole('link',{name:/근거 공시/})).toHaveAttribute('href',evidence.sourceUrl);
  await expect(dialog.getByRole('button', { name: /내보내기/ })).toHaveCount(0);
});


test('홈은 가까운 청약을 먼저 보여주고 바로 다음 달력에서 일정을 확인', async ({ page }) => {
  await setup(page); await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({json:{...data,coverage:{from:'2026-04-28',to:'2026-10-25',reviewedReports:31,omittedReports:3,reasons:{summary_unmatched:3}}}}));
  await page.goto('/');
  const calendar=page.getByRole('region',{name:'홈 공모주 캘린더'});
  await expect(calendar).toBeVisible();
  const box=await calendar.locator('.calendar-grid').boundingBox();
  const featured=await page.locator('.featured-panel').boundingBox();
  expect(featured!.y+featured!.height).toBeLessThan(page.viewportSize()!.height*0.6);
  if(page.viewportSize()!.width<600) expect(featured!.y).toBeLessThan(box!.y);
  expect(box!.y).toBeLessThan(page.viewportSize()!.height-100);
  await expect(page.getByText(/일부 공시를 자동으로 해석/)).toHaveCount(0);
  await calendar.getByRole('button',{name:'2026-10-26, 일정 2개',exact:true}).click();
  await expect(calendar.locator('.home-day-list .event-row')).toHaveCount(2);
  await expect(calendar.locator('.home-day-list')).toContainText('한빛테크');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('다가오는 일정은 내일부터 시작하는 일정만 표시하고 오늘 진행 중인 청약은 유지', async ({ page }) => {
  await setup(page);
  await page.clock.setFixedTime(new Date('2026-10-27T03:00:00Z'));
  await page.goto('/');
  const todayList = page.locator('.home-day-list');
  const upcoming = page.locator('.upcoming-section .event-list');
  // 어제 시작해 오늘 마감하는 청약과 오늘 시작하는 청약 모두 오늘 영역에 남아요.
  await expect(todayList.locator('.event-row')).toHaveCount(2);
  await expect(todayList).toContainText('한빛테크');
  await expect(todayList).toContainText('미래스팩1호');
  await expect(page.locator('.featured-company')).toHaveText('한빛테크');
  await expect(upcoming.locator('.event-row')).toHaveCount(2);
  await expect(page.locator('.upcoming-section .heading-count')).toHaveText('2');
  await expect(upcoming).not.toContainText('청약 · 삼성');
  await expect(upcoming).not.toContainText('미래스팩1호');
  // 같은 회사라도 내일의 환불은 별도 일정이므로 제외하지 않아요.
  await expect(upcoming).toContainText('한빛테크');
  await expect(upcoming).toContainText('환불 · 삼성');
  await expect(upcoming).toContainText('다음기업');
  // 오늘 일정만 있어도 가까운 청약은 사라지지 않고, 예정 목록만 비어요.
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: events.filter(event => event.id === 'a') } }));
  await page.reload();
  await expect(page.locator('.featured-company')).toHaveText('한빛테크');
  await expect(todayList.locator('.event-row')).toHaveCount(1);
  await expect(upcoming.locator('.event-row')).toHaveCount(0);
  await expect(page.locator('.upcoming-section .heading-count')).toHaveText('0');
  await expect(upcoming).toContainText('예정된 일정이 아직 없어요');
});

test('화면을 열어 두거나 조회가 실패해도 자동 재수집 요청을 반복하지 않음', async ({ page }) => {
  await setup(page); await page.unroute('**/api/schedule');
  let calls=0;
  await page.route('**/api/schedule', route => { calls++; return route.fulfill({json:data}); });
  await page.goto('/'); await expect(page.locator('.featured-company')).toContainText('한빛테크');
  const initial=calls;
  await page.clock.fastForward(6*60*60*1000);
  expect(calls).toBe(initial);
  await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => { calls++; return route.fulfill({status:503,json:{code:'DART_SYNCING'}}); });
  await page.getByRole('button',{name:'일정 새로고침'}).click();
  await expect(page.getByRole('button',{name:'일정 새로고침'})).toBeEnabled();
  const afterManual=calls;
  await page.clock.fastForward(60000);
  expect(calls).toBe(afterManual);
  await expect(page.locator('.featured-company')).toContainText('한빛테크');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
