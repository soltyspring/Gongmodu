import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
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

test('오늘 일정과 기업 리포트를 확인하고 재무 기간·손실·출처를 보존해요', async ({page})=>{
  await setup(page);await page.clock.setSystemTime(new Date('2026-10-27T03:00:00Z'));
  const summary={overview:'의료기기용 부품을 제조하는 기업입니다.',revenueModel:'자사 부품을 제조하여 판매하는 방식으로 매출을 내고 있습니다.',financials:[{period:'2026년 반기',revenue:'10,000',operatingProfit:'(1,000)',netIncome:'(2,000)',accounting:'K-IFRS'}],unit:'천원',scope:'연결 요약재무정보',receiptNo:events[0].disclosure.receiptNo,sourceUrl:events[0].disclosure.sourceUrl};
  const sourceUrl='https://m.irgo.co.kr/IPO%EC%9E%90%EB%A3%8C/123/TB/test-IR-BOOK';
  await page.unroute('**/api/schedule');await page.route('**/api/schedule',r=>r.fulfill({json:{...data,events:[{...events[0],disclosure:{...events[0].disclosure,companySummary:summary,companyReferences:[{company:events[0].company,sourceName:'IRGO',sourceUrl,fetchedAt:data.fetchedAt}]}}]}}));
  await page.goto('/');await expect(page.locator('.home-day-heading h3')).toHaveText('오늘 일정');
  await page.getByRole('button',{name:'공모가 보러가기'}).click();
  await expect(page.getByRole('button',{name:/상세 관심 저장/})).toHaveCount(0);
  await page.getByRole('button',{name:'기업 리포트 보기'}).click();
  const company=page.getByRole('dialog',{name:'기업 리포트'});await expect(company).toContainText('의료기기용 부품');await expect(company).toContainText('단위: 만원');await expect(company.locator('.financial-chart-detail')).toContainText('-100');
  await expect(company.getByRole('link',{name:/요약에 사용한 증권신고서/})).toHaveAttribute('href',summary.sourceUrl);
  await expect(company).toContainText('순이익');await expect(company.locator('.financial-chart-detail')).toContainText('-200');
  await expect(company.getByRole('link',{name:/IRGO에서 기업 소개 자료 보기/})).toHaveAttribute('href',sourceUrl);
  await page.getByRole('button',{name:'일정으로 돌아가기',exact:true}).click();await expect(page.getByRole('dialog').getByRole('region',{name:'공모가 정보'})).toBeVisible();
});

test('재무 차트에서 여러 기간을 함께 비교하고 선택한 실적의 손실·미확인을 구분해요', async ({page}, testInfo)=>{
  await setup(page);
  const summary={overview:'의료기기용 부품을 제조하는 기업입니다.',revenueModel:'의료기기 부품을 판매해요.',financials:[
    {period:'2026년 반기',revenue:'12,000,000',operatingProfit:'(2,000,000)',netIncome:'(3,000,000)',accounting:'K-IFRS'},
    {period:'2025년',revenue:'24,000,000',operatingProfit:'2,000,000',netIncome:'1,000,000',accounting:'K-IFRS'},
    {period:'2024년',revenue:'10,000,000',operatingProfit:'0',netIncome:null,accounting:'K-IFRS'},
  ],unit:'천원',scope:'연결 요약재무정보',receiptNo:events[0].disclosure.receiptNo,sourceUrl:events[0].disclosure.sourceUrl};
  await page.unroute('**/api/schedule');await page.route('**/api/schedule',r=>r.fulfill({json:{...data,events:[{...events[0],disclosure:{...events[0].disclosure,companySummary:summary}}]}}));
  await page.goto('/');await page.getByRole('button',{name:'공모가 보러가기'}).click();await page.getByRole('button',{name:'기업 리포트 보기'}).click();
  const chart=page.locator('.financial-chart');
  await expect(chart.getByRole('img')).toBeVisible();
  await expect(chart.locator('.financial-chart-periods button')).toHaveCount(3);
  await expect(chart.locator('.financial-chart-detail')).toContainText('-30억원');
  await chart.getByRole('button',{name:'2024년 실적 보기',exact:true}).click();
  await expect(chart.locator('.financial-chart-detail')).toContainText('0억원');
  await expect(chart.locator('.financial-chart-detail')).toContainText('미확인');
  await chart.getByRole('button',{name:'2026년 반기 실적 보기',exact:true}).click();
  for(const width of [360,390,768]){
    await page.setViewportSize({width,height:1000});
    await expect(chart).toBeVisible();
    expect(await chart.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    const section=page.locator('.company-report section').filter({has:page.getByRole('heading',{name:'매출과 이익을 한눈에'})});
    await section.screenshot({path:`.cache/financial-chart-${testInfo.project.name}-${width}.png`});
  }
  if(testInfo.project.name==='mobile'){
    const markup=await page.locator('.company-report').evaluate(el=>el.outerHTML);
    const css=await readFile('src/styles.css','utf8');
    await writeFile('.cache/financial-chart-preview.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>공모두 기업 재무 차트 · 테스트 자료</title><style>${css}body{background:white}main{max-width:540px;margin:auto;padding:24px}h1{font-size:24px;margin-bottom:24px}</style><main><h1>공모두 · 기업 정보</h1>${markup}</main></html>`);
  }
});

test('증권사 색상과 이름을 함께 표시하고 복수 주관사와 미확인을 구분해요', async ({ page }) => {
  await setup(page); await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [
    { ...events[0], broker:'iM증권, 삼성증권', priceText:'2,000' },
    { ...events[2], broker:'새로운증권' },
    { ...events[4], broker:null },
  ] } }));
  await page.goto('/');
  const featured = page.locator('.featured-panel');
  await expect(featured.locator('.broker-im')).toHaveText('iM증권');
  await expect(featured.locator('.broker-samsung')).toHaveText('삼성증권');
  await expect(featured.locator('.featured-price')).toContainText('2,000원');
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  await expect(page.getByRole('dialog').locator('.detail-subtitle .broker-badge')).toHaveCount(2);
  await page.getByRole('button', { name:'닫기', exact:true }).click();
  await expect(page.locator('.broker-neutral').first()).toHaveText('새로운증권');
  await expect(page.getByText('주관사 원본 확인').first()).toBeVisible();
});

test('하단 투자 안내와 이용약관·개인정보 처리방침을 확인해요', async ({ page }) => {
  await setup(page); await page.goto('/');
  const notice = page.getByRole('region', { name:'이용 안내' });
  await expect(notice).toContainText('참고용');
  const footer = page.locator('.page-footer');
  await expect(footer).not.toContainText('6시간마다 업데이트');
  await expect(footer).not.toContainText('DART 증권신고서');
  await expect(footer.getByRole('button', {name:'일정 새로고침'})).toHaveCount(0);
  await expect(footer.getByRole('button', {name:'데이터 출처 및 이용 안내'})).toHaveCount(0);
  await expect(notice).toContainText('투자를 권유하거나 특정 종목을 추천하지 않아요');
  await page.getByRole('button', { name:'이용약관', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'이용약관' })).toContainText('블루씨엘');
  await page.getByRole('button', { name:'닫기', exact:true }).click();
  await page.getByRole('button', { name:'개인정보 처리방침', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'개인정보 처리방침' })).toContainText('Cloudflare');
  await expect(page.getByRole('dialog', { name:'개인정보 처리방침' })).toContainText('bluecl@bluecl.cloud');
});

test('홈 캘린더 → 상세 → 저장 → 새로고침 → 관심 일정', async ({ page }) => {
  await setup(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('공모주 일정');
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '한빛테크', exact: true })).toBeVisible();
  await expect(dialog).toContainText('10.26 – 10.27');
  await expect(dialog.getByRole('region', { name: '공모가 정보' })).toContainText('10,000원~12,000원');
  await expect(dialog.getByRole('heading', { name: '일정', exact: true })).toBeVisible();
  await expect(dialog.getByText('날짜 단위 일정이에요', { exact: false })).toHaveCount(0);
  await expect(dialog.getByText('공시 표기', { exact: false })).toHaveCount(0);
  await expect(dialog.getByText('공시와 날짜 확인 근거', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '기업 리포트 보기' }).click();
  await expect(page.getByRole('dialog', {name:'기업 리포트'})).toContainText('기업 리포트 · 증권신고서 기준');
  await page.getByRole('button', {name:'일정으로 돌아가기',exact:true}).click();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name:'가까운 청약 관심 저장',exact:true }).click();
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
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
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

test('DART 숫자 공모가에 원을 표시하고 중복 안내를 숨겨요', async ({ page }) => {
  await setup(page); await page.unroute('**/api/schedule');
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [{ ...events[0], priceText: '2,000' }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('region', { name: '공모가 정보' })).toContainText('2,000원');
  await expect(dialog.getByRole('heading', { name: '일정', exact: true })).toBeVisible();
  await expect(dialog.locator('.detail-date')).toHaveCount(0);
});

test('월간 달력, exclusive 종료, 검색, 종류 필터, 스팩 제외, 월 이동', async ({ page }) => {
  await setup(page); await page.goto('/#calendar');
  await expect(page.locator('.page-topline')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '전체 일정', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-heading').getByRole('button', { name: '오늘', exact: true })).toBeVisible();
  await expect(page.locator('.page-title').getByRole('button', { name: '일정 새로고침' })).toHaveCount(0);
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

test('달력 날짜와 일정 글자가 읽기 쉬운 크기이고 오늘 버튼이 월 이동 옆에서 동작해요', async ({ page }) => {
  await setup(page); await page.goto('/#calendar');
  const calendar = page.locator('.schedule-layout .calendar');
  await expect(calendar.locator('.day-number').first()).toHaveCSS('font-size', '16px');
  // Wide screens show names; phones show colour bars and keep names in the selected-day list.
  if (page.viewportSize()!.width <= 600) {
    await expect(calendar).toHaveClass(/\bbars\b/);
    await expect(calendar.locator('.calendar-event').first()).toHaveCSS('height', '5px');
    await expect(calendar.locator('.calendar-event').first()).toHaveCSS('font-size', '0px');
  } else await expect(calendar.locator('.calendar-event').first()).toHaveCSS('font-size', '13px');
  await expect(calendar.locator('.calendar-weekdays')).toHaveCSS('font-size', '14px');
  const today = calendar.getByRole('button', { name: '오늘', exact: true });
  expect((await today.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
  await today.click();
  await expect(calendar.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
  await expect(calendar.getByRole('button', { name: '2026-10-25, 일정 0개' })).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.locator('.featured-panel .status-badge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '가까운 청약 관심 저장' })).toBeVisible();
  await expect(page.locator('.featured-company')).toHaveText('한빛테크');
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.reload();
  await expect(heading).toHaveText('곧 시작하는 청약이에요');
});

test('확인한 마감시간에 새로고침 없이 청약 마감으로 바뀌고 미확인은 추정하지 않아요', async ({ page }) => {
  await setup(page); await page.unroute('**/api/schedule');
  await page.clock.setSystemTime(new Date('2026-10-27T06:59:50Z'));
  const first = events[0];
  const verified = {...first, disclosure:{...first.disclosure,subscriptionClose:{time:'16:00',broker:first.broker,receiptNo:first.disclosure.receiptNo,sourceUrl:first.disclosure.sourceUrl}}};
  await page.route('**/api/schedule',route=>route.fulfill({json:{...data,events:[verified]}}));
  await page.goto('/');
  await expect(page.locator('.featured-panel')).toContainText('16:00 마감 · 공시 기준');
  await expect(page.locator('.featured-panel h2')).toHaveText('오늘 마감 예정이에요');
  await page.clock.fastForward(10000);
  await expect(page.locator('.featured-panel h2')).toHaveText('청약이 마감됐어요');
  await expect(page.locator('.home-day-list')).toContainText('청약 마감');
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  await expect(page.getByRole('dialog')).toContainText('청약 마감');
  await expect(page.getByRole('dialog').locator('.detail-facts')).toContainText('16:00 · 공시 기준');
  await page.route('**/api/schedule',route=>route.fulfill({json:{...data,events:[first]}}));
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('보통 마지막 날 16:00 마감 · 증권사마다 달라요');
  await expect(page.getByRole('dialog')).not.toContainText('공시 기준');
  await expect(page.getByRole('dialog')).not.toContainText('청약 마감');
});

test('세 탭 제목의 위치와 글꼴을 통일하고 확인 시각은 표시하지 않아요', async ({ page }) => {
  await setup(page);
  const titles = [];
  for (const [route, name] of [['home', '공모주 일정'], ['calendar', '전체 일정'], ['saved', '관심 일정']] as const) {
    await page.goto(`/#${route}`);
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText(name);
    await expect(page.locator('.page-topline')).toHaveCount(0);
    await expect(page.getByText(/10\. 25\. 12:00 확인/)).toHaveCount(0);
    titles.push(await title.evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight };
    }));
  }
  expect(titles[1]).toEqual(titles[0]);
  expect(titles[2]).toEqual(titles[0]);
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
  await page.goto('/#calendar/guide/1');
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
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.featured-company')).toContainText('한빛테크');
});

test('주관사 미확인은 누락 안내와 원문 확인 동선을 표시', async ({ page }) => {
  await setup(page);
  await page.unroute('**/api/schedule');
  const incomplete = { ...events[0], broker: null, priceText: null, disclosure: { ...events[0].disclosure, brokerSource: 'unconfirmed' } };
  await page.route('**/api/schedule', route => route.fulfill({ json: { ...data, events: [incomplete] } }));
  await page.goto('/');
  await expect(page.locator('.featured-broker')).toContainText('주관사는 공시에서 확인해 주세요');
  await expect(page.getByText(/주관사 확인이 필요한 일정이/)).toHaveCount(0);
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('원본 확인 필요');
  await expect(dialog.getByRole('region', { name: '공모가 정보' })).toContainText('공시 확인 전');
  await expect(dialog.getByRole('link', { name: /DART 공시 원문 보기/ })).toHaveAttribute('href', incomplete.disclosure.sourceUrl);
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
  await expect(page.getByRole('dialog')).toContainText('아이엠증권');
  await expect(page.getByRole('dialog')).not.toContainText('원문 인수인 표');
});

test('보류한 경쟁률 화면과 수집 요청은 출시 앱에 노출하지 않음', async ({ page }) => {
  await setup(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/competition')) requests.push(request.url()); });
  await page.goto('/#competition');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('공모주 일정');
  await expect(page.getByRole('link', { name: '청약 비교', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '공모가 보러가기' }).click();
  await expect(page.locator('.competition-snippet')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('상세에서 환불 일정과 공시 원문을 확인하고 내보내기는 제공하지 않음',async({page})=>{
  await setup(page); await page.unroute('**/api/schedule');
  const evidence={date:'2026-10-29',quote:'초과 청약증거금은 2026년 10월 29일에 환불합니다.',basis:'explicit',receiptNo:'20261008000123',sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261008000123'};
  const disclosure={...events[0].disclosure,refund:evidence};
  const refund={...events[0],id:'refund-verified',kind:'refund',start:'2026-10-29',end:'2026-10-30',startAt:'2026-10-29T00:00:00+09:00',endAt:'2026-10-30T00:00:00+09:00',disclosure};
  await page.route('**/api/schedule',route=>route.fulfill({json:{...data,events:[{...events[0],disclosure},refund]}}));
  await page.goto('/#calendar/event/refund-verified');
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading', {name:'일정',exact:true})).toBeVisible();
  await expect(dialog.locator('.detail-facts')).toContainText('환불일');await expect(dialog.locator('.detail-facts')).toContainText('10.29');
  await expect(dialog.getByRole('link',{name:/DART 공시 원문 보기/})).toHaveAttribute('href',disclosure.sourceUrl);
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
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  const afterFailure=calls;
  await page.clock.fastForward(60000);
  expect(calls).toBe(afterFailure);
  await expect(page.getByRole('button', {name:'다시 불러오기'})).toBeVisible();
});

test('기업 리포트는 공모 개요·실적 KPI·핵심 포인트·원문을 보여주고 상세 CTA는 두 버튼이에요', async ({page})=>{
  await setup(page);
  const summary={overview:'의료기기용 부품을 제조하는 기업입니다.',revenueModel:'부품을 판매해요.',financials:[
    {period:'2025년',revenue:'24,000,000',operatingProfit:'2,400,000',netIncome:'1,000,000',accounting:null},
    {period:'2024년',revenue:'20,000,000',operatingProfit:'(1,000,000)',netIncome:null,accounting:null},
  ],unit:'천원',scope:'연결 요약재무정보',receiptNo:events[0].disclosure.receiptNo,sourceUrl:events[0].disclosure.sourceUrl};
  await page.unroute('**/api/schedule');
  await page.route('**/api/schedule',r=>r.fulfill({json:{...data,events:[{...events[0],priceText:'12,000',disclosure:{...events[0].disclosure,companySummary:summary}},events[3]]}}));
  await page.goto('/');await page.getByRole('button',{name:'공모가 보러가기'}).click();
  const detail=page.getByRole('dialog');
  // An upcoming subscription has no listing date yet; say when it is fixed instead of 'unknown'.
  await expect(detail.locator('.detail-facts')).toContainText('청약 후 확정돼요');
  const cta=detail.locator('.bottom-cta');
  await expect(cta.getByRole('link',{name:/DART 공시 원문 보기/})).toHaveAttribute('href',events[0].disclosure.sourceUrl);
  const main=cta.getByRole('button',{name:'기업 리포트 보기'});
  const [link,button]=[await cta.getByRole('link').boundingBox(),await main.boundingBox()];
  expect(button!.height).toBeGreaterThanOrEqual(56);expect(Math.abs(link!.y-button!.y)).toBeLessThan(1);expect(button!.width).toBeGreaterThan(link!.width);
  await main.click();
  const report=page.getByRole('dialog',{name:'기업 리포트'});
  await expect(report.locator('.report-offer')).toContainText('12,000원');
  await expect(report.locator('.report-offer')).toContainText('10.28');
  const kpis=report.getByRole('region',{name:'실적 한눈에'});
  await expect(kpis).toContainText('240억원');await expect(kpis).toContainText('▲ 20%');await expect(kpis).toContainText('영업이익률 10%');
  await expect(report.getByRole('region',{name:'핵심 포인트'})).toContainText('2025년에 영업이익이 흑자로 바뀌었어요.');
  await expect(report.getByRole('link',{name:/요약에 사용한 증권신고서/})).toHaveAttribute('href',summary.sourceUrl);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('일정 없는 날은 한 번만 안내하고 다음 일정 날짜로 바로 이동해요', async ({ page }) => {
  await setup(page); await page.goto('/');
  const home = page.getByRole('region', { name: '홈 공모주 캘린더' });
  await expect(home.locator('.home-day-heading h3')).toHaveText('오늘 일정');
  await expect(home.locator('.day-empty > p')).toHaveText('오늘은 일정이 없어요');
  await expect(home).not.toContainText('이날은');
  await home.getByRole('button', { name: /다음 일정 10\.26 한빛테크/ }).click();
  await expect(home.locator('.home-day-heading h3')).toHaveText('10.26 일정');
  await expect(home.locator('.home-day-list .event-row')).toHaveCount(2);
  await page.goto('/#calendar');
  await page.getByRole('button', { name: '2026-10-30, 일정 0개', exact: true }).click();
  await expect(page.locator('.selected-list .day-empty > p')).toHaveText('10.30에는 일정이 없어요');
  await page.locator('.selected-list').getByRole('button', { name: /다음 일정 11\.2 다음기업/ }).click();
  await expect(page.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
  await expect(page.locator('.selected-list')).toContainText('다음기업');
});
