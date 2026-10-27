import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, Home, Info, Search, X } from 'lucide-react';
import { assignLanes, calendarCells, changeMonth, dateKey, dateRange, dayDiff, includesDate, isScheduleEvent, isSubscriptionClosed, kindLabels, lastDay, shortDate, statusLabel, verifiedCloseTime, type EventKind, type ScheduleEvent, type ScheduleResponse } from '../shared/schedule';
import { closeNative, connectNative, isNativeToss, openExternal, reportNeedsAd, showReportAd } from './platform';
import { PreparationChecklist } from './PreparationChecklist';
import { FactsFallback, type Fact } from './detail-facts';

type View = 'home' | 'calendar' | 'saved';
type Saved = Record<string, ScheduleEvent>;
const storageKey = 'gongmoa:saved:v2';
const DetailFacts=lazy(()=>import('./DetailFacts'));
const CompanyInfo=lazy(()=>import('./CompanyInfo'));
const Button = ({display, size, variant='fill', className='', ...props}:ComponentProps<'button'>&{display?:'full';size?:'large';variant?:'weak'|'fill'}) => <button {...props} className={`app-action ${variant} ${display==='full'?'full':''} ${className}`.trim()} />;
const displayPrice = (event: ScheduleEvent) => {
  const price = event.priceText?.trim();
  if (!price) return '공시 확인 전';
  return event.disclosure && /^\d{1,3}(?:,\d{3})*$|^\d+$/.test(price) ? `${Number(price.replace(/,/g, '')).toLocaleString('ko-KR')}원` : price;
};
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const calendarName = (company: string) => company
  .replace(/^에스케이증권제(\d+)호기업인수목적$/, 'SK$1호')
  .replace(/^아이엠기업인수목적(\d+)호$/, '아이엠$1호')
  .replace(/^한화플러스제(\d+)호기업인수목적$/, '한화$1호');
const tabs = [{ id: 'home', label: '홈', icon: Home }, { id: 'calendar', label: '전체 일정', icon: CalendarDays }, { id: 'saved', label: '관심 일정', icon: Bookmark }] as const;
const guides = [
  { title: '공모주 청약, 이렇게 해요', eyebrow: '공모주 첫걸음', intro: '청약부터 상장까지 순서대로 알아봐요.', steps: [
    ['일정과 주관사를 확인해요', '계좌 개설 시점과 청약 자격은 증권사마다 달라요.'],
    ['증권사 앱에서 청약해요', '증거금과 수수료를 준비해요. 공모두는 청약 신청을 받지 않아요.'],
    ['배정과 환불을 확인해요', '배정받지 못한 금액은 환불일에 돌려받아요.'],
    ['상장 일정을 확인해요', '상장 후 주가는 공모가보다 낮아질 수 있어요. 투자설명서를 읽고 직접 결정해요.'],
  ] },
  { title: '일정은 DART 공시에서 가져와요', eyebrow: '데이터 안내', intro: '금융감독원 DART의 증권신고서를 확인해요.', steps: [
    ['DART 증권신고서를 읽어와요', '청약일·주관사·공모가를 공시에서 가져와요.'],
    ['정정 공시도 반영해요', '최근 180일 공시를 매일 0·6·12·18시에 확인하고, 마지막으로 확인한 일정을 보여줘요.'],
    ['환불일·상장 예정일은 원문에 있을 때만 보여줘요', '날짜를 추정하지 않아요. 상장 예정일은 바뀔 수 있어요.'],
  ] },
  { title: '관심 일정은 이 기기에 저장해요', eyebrow: '관심 일정 안내', intro: '로그인 없이 바로 모아볼 수 있어요.', steps: [
    ['책갈피를 눌러 저장해요', '한 번 더 누르면 해제해요.'],
    ['청약 준비를 체크해요', '상세에서 확인한 항목을 체크해 두세요. 정정 공시가 나오면 새로 확인해요.'],
    ['저장과 알림은 달라요', '관심 저장은 자동 푸시 알림을 보내지 않아요. 앱 데이터를 지우면 목록도 지워질 수 있어요.'],
  ] },
];

function readSaved(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('gongmoa:saved:v1') ?? '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, e]) => isScheduleEvent(e))) as Saved;
  } catch { return {}; }
}
function useHash() {
  const [hash, setHash] = useState(location.hash.slice(1) || 'home');
  useEffect(() => { const update = () => setHash(location.hash.slice(1) || 'home'); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return hash;
}
// Colours are visual identifiers; the original broker name remains visible.
function brokerTone(name: string) {
  const key = name.replace(/주식회사|\(주\)|㈜|\s/g, '').toLowerCase();
  if (/^(im|아이엠|하이투자)(증권)?$/.test(key)) return 'im';
  if (/^삼성(증권)?$/.test(key)) return 'samsung';
  if (/^(미래에셋|미래)(증권)?$/.test(key)) return 'mirae';
  if (/^(한국투자|한투)(증권)?$/.test(key)) return 'korea';
  if (/^(nh투자|nh)(증권)?$/.test(key)) return 'nh';
  if (/^kb(증권)?$/.test(key)) return 'kb';
  if (/^신한투자?(증권)?$|^신한(증권)?$/.test(key)) return 'shinhan';
  if (/^키움(증권)?$/.test(key)) return 'kiwoom';
  if (/^대신(증권)?$/.test(key)) return 'daishin';
  return 'neutral';
}
function BrokerBadges({ broker, fallback }: { broker: string | null | undefined; fallback: string }) {
  if (!broker?.trim()) return <span className="broker-fallback">{fallback}</span>;
  return <span className="broker-badges">{broker.split(/[,，]/).map(name => name.trim()).filter(Boolean).map((name, index) => <span className={`broker-badge broker-${brokerTone(name)}`} key={`${name}-${index}`}>{name}</span>)}</span>;
}
function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><span /><span /><span /></span>;
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><CalendarDays size={28} strokeWidth={1.5} /><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function PolicyDocument({ kind }: { kind:'terms'|'privacy' }) {
  const sections = kind === 'terms' ? [
    ['서비스 안내', '블루씨엘이 운영하는 공모두는 공시를 바탕으로 공모주 청약과 관련된 일정을 참고용으로 제공해요. 청약 주문을 접수하거나 투자 권유 또는 종목 추천을 하지 않아요.'],
    ['정보를 이용할 때', '공시 정정이나 수집 시점에 따라 정보가 늦게 반영되거나 일부 누락될 수 있어요. 청약 전에 최신 공시와 주관 증권사의 안내를 확인하고 투자 여부를 직접 결정해 주세요.'],
    ['관심 일정과 준비 기록', '관심 일정과 청약 준비 기록은 사용 중인 기기에 저장돼요. 기기를 변경하거나 앱 데이터를 삭제하면 기록이 사라질 수 있어요. 관심 저장은 청약 신청이나 자동 알림을 뜻하지 않아요.'],
    ['서비스 변경과 문의', '서비스 내용이 바뀌거나 점검으로 일시 중단될 수 있어요. 중요한 변경 사항은 공모두 화면에서 알려드릴게요. 문의는 bluecl@bluecl.cloud로 보내 주세요.'],
    ['약관 변경', '약관을 변경하면 시행 전에 앱에서 변경 내용과 시행일을 안내해요. 이용자의 권리에 중대한 영향을 미치는 변경은 충분한 기간을 두고 안내해요.'],
  ] : [
    ['운영자와 문의', '공모두는 블루씨엘이 운영해요. 개인정보에 관한 문의와 열람·정정·삭제·처리정지 요청은 bluecl@bluecl.cloud로 보내 주세요.'],
    ['기기에 저장하는 정보', '관심 일정과 청약 준비 기록은 사용 중인 기기의 로컬 저장소에 저장돼요. 공모두 서버로 해당 기록을 전송하지 않아요. 기기에서 앱 데이터를 삭제하면 기록도 삭제될 수 있어요.'],
    ['접속 기록', '일정을 불러올 때 서버에 IP 주소, 접속 시각, 요청 방식과 경로, 응답 상태·크기, 처리 시간, 브라우저 또는 기기 정보가 기록될 수 있어요. 서비스 운영과 장애·보안 확인에 이용하며 서버 설정상 일 단위로 순환하고 14일을 기준으로 삭제해요.'],
    ['문의 정보', '이메일로 문의하면 발신 이메일 주소와 문의 내용, 답변 내용을 처리해요. 문의가 해결되면 관련 법령에 따른 보관이 필요한 경우를 제외하고 지체 없이 삭제해요.'],
    ['메일 서비스와 국외 처리', '문의 메일은 Cloudflare 이메일 전달을 거쳐 Google Gmail에서 처리해요. 발신 주소와 메일 내용은 전달·보관 과정에서 국외 서버에서 처리될 수 있어요. 자세한 사항은 각 서비스의 개인정보 처리방침을 확인하거나 블루씨엘에 문의해 주세요.'],
    ['정보 보호와 요청', '블루씨엘은 접근 권한을 제한하고 HTTPS 통신을 사용해 정보를 보호해요. 개인정보 관련 요청과 불편 사항은 위 이메일로 접수하며 관련 법령에 따라 처리해요.'],
    ['처리방침 변경', '처리방침이 변경되면 앱에서 변경 내용과 적용 시점을 안내해요.'],
  ];
  return <article className="policy-document"><h2 className="detail-title">{kind === 'terms' ? '이용약관' : '개인정보 처리방침'}</h2><p className="policy-date">작성일 2026년 10월 27일</p>{sections.map(([title, text]) => <section key={title}><h3>{title}</h3><p>{text}</p></section>)}</article>;
}
function Sheet({ title, children, onClose, wide = false, report = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; report?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`sheet ${wide ? 'wide' : ''} ${report ? 'is-report' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sheet-inner"><div className="sheet-handle" /><div className="sheet-top"><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={24} /></button></div>{children}</div>
  </dialog>;
}
function MonthHeading({ month, onMonth, onToday }: { month: string; onMonth: (delta: number) => void; onToday?: () => void }) {
  return <div className="calendar-heading"><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><div className="month-controls">{onToday && <button className="today-button" onClick={onToday}>오늘</button>}<button className="icon-button" aria-label="이전 달" onClick={() => onMonth(-1)}><ChevronLeft size={20} /></button><button className="icon-button" aria-label="다음 달" onClick={() => onMonth(1)}><ChevronRight size={20} /></button></div></div>;
}
function useNarrow(query = '(max-width: 600px)') {
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => { const list = matchMedia(query); const update = () => setNarrow(list.matches); list.addEventListener('change', update); return () => list.removeEventListener('change', update); }, [query]);
  return narrow;
}
/** Empty day: say it once, then offer the next date that has something on it. */
function NoDayEvents({ day, today, events, onSelect }: { day: string; today: string; events: ScheduleEvent[]; onSelect: (date: string) => void }) {
  const next = events.filter(e => e.start > day).sort((a, b) => a.start.localeCompare(b.start) || a.company.localeCompare(b.company, 'ko'))[0];
  return <div className="day-empty"><p>{day === today ? '오늘은 일정이 없어요' : `${shortDate(day)}에는 일정이 없어요`}</p>
    {next && <button className="day-next" onClick={() => onSelect(next.start)}><span className="day-next-label">다음 일정</span><span className="day-next-text"><strong>{shortDate(next.start)}</strong> {calendarName(next.company)} {kindLabels[next.kind]}</span><ChevronRight size={18} aria-hidden="true" /></button>}
  </div>;
}
function Calendar({ month, selected, events, today, onSelect, onMonth, compact = false, overview = false, showToday = false }: { month: string; selected: string; events: ScheduleEvent[]; today: string; onSelect: (date: string) => void; onMonth: (delta: number) => void; compact?: boolean; overview?: boolean; showToday?: boolean }) {
  const cells = calendarCells(month);
  const lanes = assignLanes(events.filter(e => e.start <= cells.at(-1)! && e.end > cells[0]));
  // Under 600px a 50px cell cannot hold a readable name: draw colour bars, names live in the day list.
  const bars = useNarrow();
  const lanesShown = bars ? 3 : 2;
  return <div className={`calendar ${compact ? 'compact' : ''} ${overview ? 'overview' : ''} ${bars ? 'bars' : ''}`}>
    <MonthHeading month={month} onMonth={onMonth} onToday={showToday ? () => onSelect(today) : undefined} />
    <div className="calendar-weekdays">{weekdays.map((day, i) => <span key={day} className={i === 0 ? 'sunday' : ''}>{day}</span>)}</div>
    <div className="calendar-grid">{cells.map(day => {
      const dayEvents = lanes.filter(({ event }) => includesDate(event, day));
      return <button key={day} className={`calendar-day ${day.slice(0, 7) !== month ? 'outside' : ''} ${day === selected ? 'selected' : ''} ${day === today ? 'today' : ''}`} aria-label={`${day}, 일정 ${dayEvents.length}개`} aria-pressed={day === selected} onClick={() => onSelect(day)}>
        <span className="day-number">{Number(day.slice(8))}</span>
        {compact ? <span className="day-dots">{[...new Set(dayEvents.map(x => x.event.kind))].slice(0, 3).map(kind => <i key={kind} className={`dot ${kind}`} />)}</span> : <span className="day-events">{Array.from({ length: lanesShown }, (_, lane) => {
          const e = dayEvents.find(x => x.lane === lane)?.event;
          if (!e) return <span className="event-spacer" key={lane} />;
          // The name starts the bar (or a new week row) and spans the event's days in that row,
          // so a 3-day subscription gets 3 cells of width instead of being clipped to one.
          const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
          const head = e.start === day || weekday === 0;
          const span = head ? Math.min(dayDiff(day, lastDay(e)) + 1, 7 - weekday) : 0;
          return <span key={lane} className={`calendar-event ${e.kind} ${e.start === day ? 'starts' : ''} ${lastDay(e) === day ? 'ends' : ''}`} title={e.title}>{head ? <span className="calendar-event-label" style={{ width: `calc(${span * 100}% + ${(span - 1) * 4}px)` }}>{calendarName(e.company)}</span> : null}</span>;
        })}{dayEvents.some(x => x.lane >= lanesShown) && <span className="more-events">+{dayEvents.filter(x => x.lane >= lanesShown).length}</span>}</span>}
      </button>;
    })}</div>
    <div className="calendar-legend">{(['subscription', 'listing', 'refund', 'other'] as const).filter(kind => lanes.some(({ event }) => event.kind === kind)).map(kind => <span key={kind}><i className={`dot ${kind}`} />{kindLabels[kind]}</span>)}</div>
  </div>;
}

export default function App() {
  const hash = useHash();
  const route = hash.split('/');
  const view: View = ['home', 'calendar', 'saved'].includes(route[0]) ? route[0] as View : 'home';
  const [today, setToday] = useState(dateKey());
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [toast, setToast] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EventKind | 'all'>('all');
  const [hideSpac, setHideSpac] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'month' | 'list'>('month');
  const [savedFilter, setSavedFilter] = useState<'upcoming' | 'all'>('upcoming');

  async function refresh() {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api/schedule`, { signal: AbortSignal.timeout(16000) });
      if (!response.ok) {
        setError('일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const body: ScheduleResponse = await response.json();
      if (!Array.isArray(body.events) || !body.events.every(isScheduleEvent) || !body.source || !Number.isFinite(Date.parse(body.fetchedAt))) throw new Error('invalid');
      setData(body);
    } catch { setError('일정을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); const tick = () => { setToday(dateKey()); setNowMinute(Math.floor(Date.now() / 60000)); }; const timer = setInterval(tick, 1000); document.addEventListener('visibilitychange', tick); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); }; }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const events = data?.events ?? [];
  const savedEvents = useMemo(() => Object.values(saved).map(e => events.find(current => current.id === e.id) ?? e).sort((a, b) => a.start.localeCompare(b.start)), [saved, events]);
  let eventId: string | undefined;
  try { eventId = route[1] === 'event' ? decodeURIComponent(route.slice(2).join('/')) : undefined; } catch { eventId = undefined; }
  if(route[1]==='company')try{eventId=decodeURIComponent(route.slice(2).join('/'));}catch{eventId=undefined;}
  const active = events.find(e => e.id === eventId) ?? savedEvents.find(e => e.id === eventId);
  const activeDateEvidence=active?.kind==='refund'?active.disclosure?.refund:active?.kind==='listing'?active.disclosure?.listing:null;
  const remaining = events.filter(e => e.end > today).sort((a, b) => a.start.localeCompare(b.start) || a.company.localeCompare(b.company, 'ko'));
  const upcoming = remaining.filter(e => e.start > today);
  const nextSubscriptions = remaining.filter(e => e.kind === 'subscription').sort((a, b) => {
    const aActive = includesDate(a, today), bActive = includesDate(b, today);
    const aClosed = isSubscriptionClosed(a, nowMinute * 60000), bClosed = isSubscriptionClosed(b, nowMinute * 60000);
    if (aActive && bActive && aClosed !== bClosed) return aClosed ? 1 : -1;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (aActive ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)) || a.company.localeCompare(b.company, 'ko');
  });
  const featured = nextSubscriptions[0];
  const featuredClose = featured ? verifiedCloseTime(featured) : null;
  const featuredHeading = !featured ? '청약 일정을 확인해요'
    : isSubscriptionClosed(featured, nowMinute * 60000) ? '청약이 마감됐어요'
    : includesDate(featured, today) ? (lastDay(featured) === today ? '오늘 마감 예정이에요' : '지금 청약을 진행하고 있어요')
    : dayDiff(today, featured.start) === 1 ? '내일 청약이 시작돼요' : '곧 시작하는 청약이에요';
  const featuredRefund = featured?.disclosure?.refund?.date;
  const nextSaved = savedEvents.find(event => event.end > today);
  const related = active ? events.filter(e => active.disclosure ? e.disclosure?.offeringId === active.disclosure.offeringId : !e.disclosure && e.company === active.company) : [];
  const activeClose = active ? verifiedCloseTime(active) : null;
  const facts: Fact[] = active ? (['subscription', 'refund', 'listing'] as const).map(kind => {
    const event = related.find(e => e.kind === kind) ?? (active.kind === kind ? active : undefined);
    const subscription = related.find(e => e.kind === 'subscription') ?? (active.kind === 'subscription' ? active : undefined);
    // Listing dates are fixed by the issue-results report filed after subscription closes.
    const pending = kind === 'listing' && !!subscription && subscription.end > today ? '청약 후 확정돼요' : '공시 확인 전';
    return { label: kind === 'listing' ? '상장 예정일' : `${kindLabels[kind]}일`, value: event ? dateRange(event) : pending, known: !!event };
  }) : [];
  if (activeClose) facts.splice(1, 0, { label: '마감 시간', value: `${activeClose.time} · 공시 기준`, known: true });
  const filtered = events.filter(e => (filter === 'all' || e.kind === filter) && (!hideSpac || !/스팩|SPAC/i.test(e.title)) && `${e.company} ${e.title} ${e.broker || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const monthEvents = filtered.filter(e => e.start < `${changeMonth(month, 1)}-01` && e.end > `${month}-01`);
  const selectedEvents = monthEvents.filter(e => includesDate(e, selected));
  const savedVisible = savedEvents.filter(e => savedFilter === 'all' || e.end > today);
  const go = (to: string) => {
    if (route[1] === 'guide' && to.startsWith(`${view}/guide/`)) {
      history.replaceState(null, '', `#${to}`); window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else location.hash = to;
  };
  const open = (event: ScheduleEvent) => go(`${view}/event/${encodeURIComponent(event.id)}`);
  const closeSheet = () => { const target=route[1]==='company'&&active?`${view}/event/${encodeURIComponent(active.id)}`:view; history.replaceState(null, '', `#${target}`); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  useEffect(() => connectNative(() => {
    if (route[1]) closeSheet();
    else if (view !== 'home') go('home');
    else void closeNative();
  }), [hash, active?.id]);
  function selectDate(day: string) { setSelected(day); setMonth(day.slice(0, 7)); }
  function moveMonth(delta: number) { const next = changeMonth(month, delta); setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`); }
  function toggleSave(event: ScheduleEvent) {
    const next = { ...saved };
    if (next[event.id]) delete next[event.id]; else next[event.id] = event;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); setToast(next[event.id] ? '관심 일정에 저장했어요' : '관심 일정을 해제했어요'); }
    catch { setToast('기기 저장 공간을 확인한 뒤 다시 시도해 주세요'); }
  }
  const eventStatus = (event: ScheduleEvent) => isSubscriptionClosed(event, nowMinute * 60000) ? '청약 마감' : statusLabel(event, today);
  const [opening, setOpening] = useState(false);
  const adGate = reportNeedsAd();
  async function openReport(event: ScheduleEvent) {
    if (opening) return;
    setOpening(true);
    try { await showReportAd(); go(`${view}/company/${encodeURIComponent(event.id)}`); }
    finally { setOpening(false); }
  }
  const row = (event: ScheduleEvent, date = true) => <div className="event-row" key={event.id}>
    <button className="event-open" onClick={() => open(event)}><span className={`event-symbol ${event.kind}`} aria-hidden="true">{kindLabels[event.kind].slice(0, 1)}</span><span className="event-copy"><span className="event-company">{event.company}</span>{event.kind === 'subscription' && event.priceText && <span className="event-price">공모가 <strong>{displayPrice(event)}</strong></span>}<span className="event-meta">{kindLabels[event.kind]} · <BrokerBadges broker={event.broker} fallback="주관사 원본 확인" />{!event.disclosure ? ' · 이전 출처' : ''}</span>{date && <span className="event-date">{dateRange(event)}</span>}{verifiedCloseTime(event) && <span className="event-close">{verifiedCloseTime(event)!.time} 마감</span>}</span><span className={`event-status ${isSubscriptionClosed(event, nowMinute * 60000) ? 'is-closed' : includesDate(event, today) ? 'in-progress' : ''}`}>{eventStatus(event)}</span><ChevronRight className="row-chevron" size={18} /></button>
    <button className={`save-button ${saved[event.id] ? 'is-saved' : ''}`} aria-label={`${event.company} ${kindLabels[event.kind]} 관심 ${saved[event.id] ? '해제' : '저장'}`} aria-pressed={!!saved[event.id]} onClick={() => toggleSave(event)}><Bookmark size={20} fill={saved[event.id] ? 'currentColor' : 'none'} /></button>
  </div>;

  return <div className="app-shell" onClick={event => {
    const link = (event.target as Element).closest('a[target="_blank"]');
    if (link instanceof HTMLAnchorElement && isNativeToss()) {
      event.preventDefault(); void openExternal(link.href).catch(() => setToast('원본 링크를 열지 못했어요. 잠시 후 다시 시도해 주세요'));
    }
  }}>
    <aside className="sidebar"><a className="brand" href="#home"><Mark /><span>공모두</span></a><nav aria-label="주요 메뉴">{tabs.map(({ id, label, icon: Icon }) => <a href={`#${id}`} className={`nav-link ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} key={id}><Icon size={24} /><span>{label}</span></a>)}</nav><div className="sidebar-bottom"><button className="help-link" onClick={() => go(`${view}/guide/0`)}><CircleHelp size={24} />공모주가 처음인가요?</button></div></aside>
    <header className="mobile-header"><a className="brand" href="#home"><Mark small /><span>공모두</span></a><button className="icon-button" aria-label="공모두 이용 안내" onClick={() => go(`${view}/guide/1`)}><Info size={21} /></button></header>
    <main className={`main-content view-${view}`}>
      <div className="page-title"><h1>{view === 'home' ? '공모주 일정' : view === 'calendar' ? '전체 일정' : '관심 일정'}</h1></div>
      {error && !data && <div className="notice" role="alert"><Info size={18} /><span>{error}</span><button onClick={() => void refresh()} disabled={loading}>다시 시도</button></div>}
      {loading && !data ? <div className="loading-grid" aria-busy="true" aria-label="공모주 일정을 불러오고 있어요"><div className="skeleton main-skeleton" /><div className="skeleton calendar-skeleton" /><p>저장된 일정을 불러오고 있어요</p></div> : !data && error ? <Empty title="일정을 다시 불러와 주세요" text="연결 후 공모주 일정을 확인할 수 있어요." action={<Button onClick={() => void refresh()}>다시 불러오기</Button>} /> : <>
      {view === 'home' && <div className="home-layout subscription-first">
          <section className="featured-panel panel"><div className="section-heading"><h2>{featuredHeading}</h2>{featured && <div className="featured-controls"><button className={`save-button ${saved[featured.id] ? 'is-saved' : ''}`} aria-label={`가까운 청약 ${saved[featured.id] ? '관심 해제' : '관심 저장'}`} aria-pressed={!!saved[featured.id]} onClick={() => toggleSave(featured)}><Bookmark size={21} fill={saved[featured.id] ? 'currentColor' : 'none'} /></button></div>}</div>{featured ? <>
            <button className="featured-company" onClick={() => open(featured)}>{featured.company}<ChevronRight size={20} /></button><div className="featured-broker"><BrokerBadges broker={featured.broker} fallback="주관사는 공시에서 확인해 주세요" /></div>
            {featured.priceText && <p className="featured-price">공모가 <strong>{displayPrice(featured)}</strong></p>}
            <div className="featured-summary"><div className="featured-period"><span>청약일</span><strong>{dateRange(featured)}</strong></div><div className="featured-refund"><span>환불일</span><strong>{featuredRefund ? shortDate(featuredRefund) : '공시 확인 전'}</strong></div></div>
            <p className="closing-time">{featuredClose ? `${featuredClose.time} 마감 · 공시 기준` : '보통 마지막 날 16:00 마감 · 증권사마다 달라요'}</p>
            <Button size="large" display="full" onClick={() => open(featured)}>공모가 보러가기</Button>
          </> : <Empty title="새로운 청약을 기다리고 있어요" text="이전 기록은 전체 일정에서 확인해 보세요." />}</section>
        <section className="panel calendar-panel home-calendar" aria-label="홈 공모주 캘린더">
          <Calendar month={month} selected={selected} events={events} today={today} onSelect={selectDate} onMonth={moveMonth} overview />
          <div className="home-day-heading"><h3>{selected===today?'오늘 일정':`${shortDate(selected)} 일정`}</h3><button className="text-button" onClick={() => { setCalendarMode('month'); go('calendar'); }}>전체 일정 <ChevronRight size={16} /></button></div>
          <div className="home-day-list">{events.filter(e => includesDate(e, selected)).length ? events.filter(e => includesDate(e, selected)).map(e => row(e, false)) : <NoDayEvents day={selected} today={today} events={events} onSelect={selectDate} />}</div>
        </section>
          <section className="upcoming-section"><div className="section-heading"><h2>다가오는 일정 <span className="heading-count">{upcoming.length}</span></h2><button className="text-button" onClick={() => { setCalendarMode('list'); go('calendar'); }}>전체 보기 <ChevronRight size={16} /></button></div>{nextSaved && <button className="saved-return" onClick={() => go('saved')}><Bookmark size={18} /><span><strong>내 관심 일정</strong><span>{nextSaved.company} · {dateRange(nextSaved)}</span></span><ChevronRight size={18} /></button>}<div className="panel event-list">{upcoming.length ? upcoming.slice(0, 4).map(e => row(e)) : <Empty title="예정된 일정이 아직 없어요" text="전체 일정에서 이전 기록을 확인할 수 있어요." />}</div></section>
      </div>}
      {view === 'calendar' && <>
        <div className="calendar-toolbar"><label className="search-field"><Search size={19} /><input aria-label="종목명 또는 증권사 검색" placeholder="종목명·증권사 검색" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={16} /></button>}</label><div className="segmented" aria-label="일정 보기 방식"><button className={calendarMode === 'month' ? 'selected' : ''} aria-pressed={calendarMode === 'month'} onClick={() => setCalendarMode('month')}>달력</button><button className={calendarMode === 'list' ? 'selected' : ''} aria-pressed={calendarMode === 'list'} onClick={() => setCalendarMode('list')}>목록</button></div></div>
        <div className="filters"><div className="filter-buttons">{(['all', ...new Set(events.map(e => e.kind))] as const).map(kind => <button key={kind} className={filter === kind ? 'active' : ''} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? '전체' : kindLabels[kind]}</button>)}</div><label className="spac-filter"><input type="checkbox" checked={hideSpac} onChange={e => setHideSpac(e.target.checked)} />스팩 제외</label></div>
        <div className={`schedule-layout ${calendarMode === 'list' ? 'list-mode' : ''}`}><section className="panel calendar-panel">{calendarMode === 'month' ? <Calendar month={month} selected={selected} events={monthEvents} today={today} onSelect={selectDate} onMonth={moveMonth} showToday /> : <><MonthHeading month={month} onMonth={moveMonth} onToday={() => selectDate(today)} /><div className="month-list-caption">조건에 맞는 일정 {monthEvents.length}개</div>{monthEvents.length ? monthEvents.map(e => row(e)) : <Empty title="조건에 맞는 일정이 없어요" text="다른 달이나 검색어로 다시 찾아보세요." />}</>}</section>{calendarMode === 'month' && <section className="selected-day-panel"><div className="section-heading"><h2>{shortDate(selected)} <span>{weekdays[new Date(`${selected}T12:00:00Z`).getUTCDay()]}요일</span></h2>{selectedEvents.length > 0 && <span className="quiet-label">{selectedEvents.length}개 일정</span>}</div><div className="panel selected-list">{selectedEvents.length ? selectedEvents.map(e => row(e, false)) : <NoDayEvents day={selected} today={today} events={filtered} onSelect={selectDate} />}</div></section>}</div>
      </>}
      {view === 'saved' && <><div className="saved-toolbar"><div className="segmented"><button className={savedFilter === 'upcoming' ? 'selected' : ''} aria-pressed={savedFilter === 'upcoming'} onClick={() => setSavedFilter('upcoming')}>예정된 일정</button><button className={savedFilter === 'all' ? 'selected' : ''} aria-pressed={savedFilter === 'all'} onClick={() => setSavedFilter('all')}>전체</button></div><span className="quiet-label">{savedVisible.length}개 일정</span></div><div className="saved-layout"><section className="panel saved-list">{savedVisible.length ? savedVisible.map(e => row(e)) : <Empty title={savedFilter === 'upcoming' && savedEvents.length ? '저장한 일정이 모두 종료됐어요' : '기억해 둘 공모주를 모아보세요'} text={savedEvents.length ? '전체를 누르면 이전에 저장한 일정을 볼 수 있어요.' : '일정 옆 책갈피를 누르면 여기에 모아드려요.'} action={<Button variant="weak" onClick={() => go('calendar')}>공모주 일정 둘러보기</Button>} />}</section></div></>}
      </>}
      <footer className="page-footer"><section className="footer-notice" aria-label="이용 안내"><p>공모두의 정보는 참고용이에요. 투자를 권유하거나 특정 종목을 추천하지 않아요. 청약 전 최신 공시와 증권사 안내를 확인해 주세요.</p></section><nav className="footer-policies" aria-label="이용약관 및 개인정보 처리방침"><button onClick={() => go(`${view}/policy/terms`)}>이용약관</button><button onClick={() => go(`${view}/policy/privacy`)}>개인정보 처리방침</button></nav></footer>
    </main>
    <nav className="mobile-nav" aria-label="하단 메뉴">{tabs.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}><Icon size={24} strokeWidth={view === id ? 2.3 : 1.7} /><span>{label}</span></a>)}</nav>
    {route[1] === 'event' && <Sheet title={active?.company || '일정 상세'} onClose={closeSheet}>{active ? <>
      <div className="detail-eyebrow"><span className={`kind-label ${active.kind}`}>{kindLabels[active.kind]}</span><span>{eventStatus(active)}</span></div><h2 className="detail-title">{active.company}</h2><div className="detail-subtitle"><BrokerBadges broker={active.broker} fallback="주관사 원본 확인 필요" /></div>
      {activeDateEvidence?.basis==='broker-announcement' && <p className="small-note">증권사 공개 안내 기준이라 바뀔 수 있어요.</p>}
      {!events.some(e => e.id === active.id) && <div className="notice"><Info size={17} />기기에 저장한 일정이에요. 최신 일정은 원본을 확인해 주세요.</div>}
      <section className="detail-price" aria-label="공모가 정보"><h3>공모가</h3><strong>{displayPrice(active)}</strong></section>
      <section className="detail-section detail-facts" aria-labelledby="detail-schedule-heading"><h3 id="detail-schedule-heading">일정</h3>
        <Suspense fallback={<FactsFallback facts={facts} />}><DetailFacts facts={facts} /></Suspense>
        {active.kind === 'subscription' && !activeClose && <p className="closing-time detail-closing-time">보통 마지막 날 16:00 마감 · 증권사마다 달라요</p>}
      </section>
      {active.kind === 'subscription' && <PreparationChecklist key={active.id} event={active} />}
      <div className="detail-actions bottom-cta">{active.disclosure && <a className="app-action weak" href={active.disclosure.sourceUrl} target="_blank" rel="noreferrer" aria-label="DART 공시 원문 보기 (외부 페이지)">공시 원문</a>}<Button className="cta-main" disabled={opening} onClick={() => void openReport(active)}>{opening ? '광고를 불러오고 있어요' : adGate ? '광고 보고 기업 리포트 열기' : '기업 리포트 보기'}</Button></div>
    </> : loading ? <div className="detail-loading" role="status" aria-busy="true">저장된 일정을 불러오고 있어요</div> : error && !data ? <Empty title="일정을 다시 불러와 주세요" text="연결 후 상세 일정을 확인할 수 있어요." action={<Button onClick={() => void refresh()}>다시 불러오기</Button>} /> : <Empty title="이 일정을 찾을 수 없어요" text="일정이 변경됐을 수 있어요. 전체 일정에서 다시 확인해 주세요." action={<Button onClick={closeSheet}>일정으로 돌아가기</Button>} />}</Sheet>}
    {route[1] === 'guide' && <Sheet title="공모두 이용 안내" onClose={closeSheet}><div className="guide-tabs">{guides.map((g, i) => <button className={Number(route[2] || 0) === i ? 'active' : ''} key={g.eyebrow} onClick={() => go(`${view}/guide/${i}`)}>{g.eyebrow}</button>)}</div>{(() => { const guide = guides[Number(route[2])] || guides[0]; return <><h2 className="detail-title">{guide.title}</h2><p className="guide-intro">{guide.intro}</p><div className="guide-steps">{guide.steps.map(([title, text], i) => <div key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div>{guide === guides[1] && <a className="source-external" href={data?.source.url || 'https://dart.fss.or.kr/dsac008/main.do'} target="_blank" rel="noreferrer">DART 청약 달력에서 직접 확인하기 <ExternalLink size={16} /></a>}<Button display="full" size="large" onClick={closeSheet}>확인했어요</Button></>; })()}</Sheet>}
    {route[1] === 'policy' && (route[2] === 'terms' || route[2] === 'privacy') && <Sheet title={route[2] === 'terms' ? '이용약관' : '개인정보 처리방침'} onClose={closeSheet}><PolicyDocument kind={route[2]} /><Button display="full" size="large" onClick={closeSheet}>확인했어요</Button></Sheet>}
    {route[1]==='company'&&<Sheet title="기업 리포트" onClose={closeSheet} report>{active?<><Suspense fallback={<p role="status">기업 리포트를 열고 있어요</p>}><CompanyInfo event={active} facts={facts} price={displayPrice(active)}/></Suspense><div className="detail-actions bottom-cta"><Button variant="weak" className="cta-main" onClick={closeSheet}>일정으로 돌아가기</Button></div></>:<p role="status">{loading?'저장된 일정을 불러오고 있어요':'이 기업의 일정을 찾을 수 없어요'}</p>}</Sheet>}
    {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
  </div>;
}
