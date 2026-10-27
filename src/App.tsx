import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { Button as TDSButton, ListRow } from '@toss/tds-mobile';
import { Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, Home, Info, RefreshCw, Search, X } from 'lucide-react';
import { assignLanes, calendarCells, changeMonth, dateKey, dateRange, dayDiff, includesDate, isScheduleEvent, kindLabels, lastDay, shortDate, statusLabel, type EventKind, type ScheduleEvent, type ScheduleResponse } from '../shared/schedule';
import { closeNative, connectNative, isNativeToss, openExternal } from './platform';
import { PreparationChecklist } from './PreparationChecklist';

type View = 'home' | 'calendar' | 'saved';
type Saved = Record<string, ScheduleEvent>;
const storageKey = 'gongmoa:saved:v2';
const Button = (props: ComponentProps<typeof TDSButton>) => <TDSButton {...props} className="tds-action" />;
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const calendarName = (company: string) => company
  .replace(/^에스케이증권제(\d+)호기업인수목적$/, 'SK$1호')
  .replace(/^아이엠기업인수목적(\d+)호$/, '아이엠$1호')
  .replace(/^한화플러스제(\d+)호기업인수목적$/, '한화$1호');
const tabs = [{ id: 'home', label: '홈', icon: Home }, { id: 'calendar', label: '전체 일정', icon: CalendarDays }, { id: 'saved', label: '관심 일정', icon: Bookmark }] as const;
const guides = [
  { title: '공모주 청약, 어떻게 시작하나요?', eyebrow: '공모주 첫걸음', intro: '청약부터 상장까지, 순서대로 알아봐요.', steps: [
    ['일정과 주관사를 확인해요', '청약 날짜와 청약을 받는 증권사를 확인해요. 계좌 개설 가능 시점과 청약 자격은 증권사마다 달라요.'],
    ['증권사에서 청약해요', '청약 증거금과 수수료를 준비하고 해당 증권사의 앱에서 신청해요. 공모두에서는 청약 신청을 받지 않아요.'],
    ['배정과 환불을 확인해요', '청약 후 배정 수량과 환불일을 증권사에서 확인해요. 배정받지 못한 금액은 정해진 환불일에 돌려받아요.'],
    ['상장 일정을 확인해요', '상장 후 주가는 공모가보다 낮아질 수 있어요. 투자 여부는 공시와 투자설명서를 확인한 뒤 결정해요.'],
  ] },
  { title: '일정은 어디에서 가져오나요?', eyebrow: '데이터 안내', intro: '금융감독원 DART의 증권신고서를 확인해요.', steps: [
    ['DART 증권신고서를 읽어와요', '공시 검색과 지분증권 주요정보에서 청약기일·인수인·모집가액을 가져와요. 주관사 정보가 빠지면 같은 접수번호의 원문 인수인 표에서 보완해요. IPO 여부는 신고서 원문에서 추가 확인해요.'],
    ['정정 공시를 함께 확인해요', '최근 180일 접수 공시를 기본으로 조회하고, 공시 접수번호가 일치하는 정보만 사용해요. 서버에서 매일 0시·6시·12시·18시에 공시를 수집해요. 앱은 마지막으로 수집을 마친 일정을 보여줘요. 확인 시간은 실제 수집 시각이에요.'],
    ['환불일과 상장 예정일도 원문으로 확인해요', '원문에 날짜가 명시되거나 환불이 납입기일이라고 명시된 경우만 표시해요. 최종 공시가 변경 부분만 담으면 같은 공모의 이전 전문을 함께 확인하며 근거 공시를 연결해요. 상장 예정일은 변경될 수 있어요.'],
  ] },
  { title: '관심 일정은 어떻게 보관하나요?', eyebrow: '관심 일정 안내', intro: '지금 사용하는 기기에 관심 일정을 저장해요.', steps: [
    ['관심 버튼을 눌러요', '마음에 드는 일정의 책갈피를 눌러 저장해요. 다시 누르면 해제할 수 있어요.'],
    ['청약 준비를 기록해요', '청약 상세에서 직접 확인한 항목을 체크해요. 기록은 이 기기에만 남고 청약 신청을 대신하지 않아요. 정정 공시는 다시 확인해 주세요.'],
        ['저장과 알림은 달라요', '관심 저장은 자동 푸시 알림을 보내지 않아요. 일정 변경은 앱에서 다시 확인해 주세요. 기기 데이터를 삭제하면 관심 목록도 지워질 수 있어요.'],
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
function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><span /><span /><span /></span>;
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><CalendarDays size={28} strokeWidth={1.5} /><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function Sheet({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`sheet ${wide ? 'wide' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sheet-inner"><div className="sheet-handle" /><div className="sheet-top"><span>공모두</span><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={22} /></button></div>{children}</div>
  </dialog>;
}
function Calendar({ month, selected, events, today, onSelect, onMonth, compact = false, overview = false }: { month: string; selected: string; events: ScheduleEvent[]; today: string; onSelect: (date: string) => void; onMonth: (delta: number) => void; compact?: boolean; overview?: boolean }) {
  const cells = calendarCells(month);
  const lanes = assignLanes(events.filter(e => e.start <= cells.at(-1)! && e.end > cells[0]));
  return <div className={`calendar ${compact ? 'compact' : ''} ${overview ? 'overview' : ''}`}>
    <div className="calendar-heading"><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><div className="month-controls"><button className="icon-button" aria-label="이전 달" onClick={() => onMonth(-1)}><ChevronLeft size={20} /></button><button className="icon-button" aria-label="다음 달" onClick={() => onMonth(1)}><ChevronRight size={20} /></button></div></div>
    <div className="calendar-weekdays">{weekdays.map((day, i) => <span key={day} className={i === 0 ? 'sunday' : ''}>{day}</span>)}</div>
    <div className="calendar-grid">{cells.map(day => {
      const dayEvents = lanes.filter(({ event }) => includesDate(event, day));
      return <button key={day} className={`calendar-day ${day.slice(0, 7) !== month ? 'outside' : ''} ${day === selected ? 'selected' : ''} ${day === today ? 'today' : ''}`} aria-label={`${day}, 일정 ${dayEvents.length}개`} aria-pressed={day === selected} onClick={() => onSelect(day)}>
        <span className="day-number">{Number(day.slice(8))}</span>
        {compact ? <span className="day-dots">{[...new Set(dayEvents.map(x => x.event.kind))].slice(0, 3).map(kind => <i key={kind} className={`dot ${kind}`} />)}</span> : <span className="day-events">{[0, 1].map(lane => {
          const e = dayEvents.find(x => x.lane === lane)?.event;
          return e ? <span key={lane} className={`calendar-event ${e.kind} ${e.start === day ? 'starts' : ''} ${lastDay(e) === day ? 'ends' : ''}`} title={e.title}>{e.start === day || new Date(`${day}T12:00:00Z`).getUTCDay() === 0 ? calendarName(e.company) : '　'}</span> : <span className="event-spacer" key={lane} />;
        })}{dayEvents.some(x => x.lane > 1) && <span className="more-events">+{dayEvents.filter(x => x.lane > 1).length}</span>}</span>}
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
  useEffect(() => { void refresh(); const timer = setInterval(() => setToday(dateKey()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const events = data?.events ?? [];
  const savedEvents = useMemo(() => Object.values(saved).map(e => events.find(current => current.id === e.id) ?? e).sort((a, b) => a.start.localeCompare(b.start)), [saved, events]);
  let eventId: string | undefined;
  try { eventId = route[1] === 'event' ? decodeURIComponent(route.slice(2).join('/')) : undefined; } catch { eventId = undefined; }
  const active = events.find(e => e.id === eventId) ?? savedEvents.find(e => e.id === eventId);
  const activeDateEvidence=active?.kind==='refund'?active.disclosure?.refund:active?.kind==='listing'?active.disclosure?.listing:null;
  const remaining = events.filter(e => e.end > today).sort((a, b) => a.start.localeCompare(b.start) || a.company.localeCompare(b.company, 'ko'));
  const upcoming = remaining.filter(e => e.start > today);
  const nextSubscriptions = remaining.filter(e => e.kind === 'subscription').sort((a, b) => {
    const aActive = includesDate(a, today), bActive = includesDate(b, today);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (aActive ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)) || a.company.localeCompare(b.company, 'ko');
  });
  const featured = nextSubscriptions[0];
  const featuredHeading = !featured ? '청약 일정을 확인해요'
    : includesDate(featured, today) ? (lastDay(featured) === today ? '오늘 마감 예정이에요' : '지금 청약을 진행하고 있어요')
    : dayDiff(today, featured.start) === 1 ? '내일 청약이 시작돼요' : '곧 시작하는 청약이에요';
  const featuredRefund = featured?.disclosure?.refund?.date;
  const nextSaved = savedEvents.find(event => event.end > today);
  const related = active ? events.filter(e => active.disclosure ? e.disclosure?.offeringId === active.disclosure.offeringId : !e.disclosure && e.company === active.company) : [];
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
  const closeSheet = () => { history.replaceState(null, '', `#${view}`); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  useEffect(() => connectNative(() => {
    if (route[1]) closeSheet();
    else if (view !== 'home') go('home');
    else void closeNative();
  }), [hash]);
  function selectDate(day: string) { setSelected(day); setMonth(day.slice(0, 7)); }
  function moveMonth(delta: number) { const next = changeMonth(month, delta); setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`); }
  function toggleSave(event: ScheduleEvent) {
    const next = { ...saved };
    if (next[event.id]) delete next[event.id]; else next[event.id] = event;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); setToast(next[event.id] ? '관심 일정에 저장했어요' : '관심 일정을 해제했어요'); }
    catch { setToast('기기 저장 공간을 확인한 뒤 다시 시도해 주세요'); }
  }
  const row = (event: ScheduleEvent, date = true) => <div className="event-row" key={event.id}>
    <button className="event-open" onClick={() => open(event)}><span className={`event-symbol ${event.kind}`} aria-hidden="true">{kindLabels[event.kind].slice(0, 1)}</span><span className="event-copy"><span className="event-company">{event.company}</span><span className="event-meta">{kindLabels[event.kind]}{event.broker ? ` · ${event.broker}` : ' · 주관사 원본 확인'}{!event.disclosure ? ' · 이전 출처' : ''}</span>{date && <span className="event-date">{dateRange(event)}</span>}</span><span className={`event-status ${includesDate(event, today) ? 'in-progress' : ''}`}>{statusLabel(event, today)}</span><ChevronRight className="row-chevron" size={18} /></button>
    <button className={`save-button ${saved[event.id] ? 'is-saved' : ''}`} aria-label={`${event.company} ${kindLabels[event.kind]} 관심 ${saved[event.id] ? '해제' : '저장'}`} aria-pressed={!!saved[event.id]} onClick={() => toggleSave(event)}><Bookmark size={20} fill={saved[event.id] ? 'currentColor' : 'none'} /></button>
  </div>;

  return <div className="app-shell" onClick={event => {
    const link = (event.target as Element).closest('a[target="_blank"]');
    if (link instanceof HTMLAnchorElement && isNativeToss()) {
      event.preventDefault(); void openExternal(link.href).catch(() => setToast('원본 링크를 열지 못했어요. 잠시 후 다시 시도해 주세요'));
    }
  }}>
    <aside className="sidebar"><a className="brand" href="#home"><Mark /><span>공모두</span></a><p className="brand-caption">공시로 확인하는 청약 일정</p><nav aria-label="주요 메뉴">{tabs.map(({ id, label, icon: Icon }) => <a href={`#${id}`} className={`nav-link ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} key={id}><Icon size={20} /><span>{label}</span></a>)}</nav><div className="sidebar-bottom"><button className="help-link" onClick={() => go(`${view}/guide/0`)}><CircleHelp size={18} />공모주가 처음인가요?</button><div className="sidebar-note"><span className="source-dot" />DART 공시와 연결해요<p>일정은 주관사 공지로<br />한 번 더 확인해 주세요.</p></div><span className="sidebar-version">공모두 · 앱인토스 미니앱</span></div></aside>
    <header className="mobile-header"><a className="brand" href="#home"><Mark small /><span>공모두</span></a><button className="icon-button" aria-label="공모두 이용 안내" onClick={() => go(`${view}/guide/1`)}><Info size={21} /></button></header>
    <main className={`main-content view-${view}`}>
      <div className="page-title"><h1>{view === 'home' ? '공모주 일정' : view === 'calendar' ? '전체 일정' : '관심 일정'}</h1>{view === 'calendar' && <button className="secondary-button today-button" onClick={() => selectDate(today)}>오늘</button>}</div>
      {error && !data && <div className="notice" role="alert"><Info size={18} /><span>{error}</span><button onClick={() => void refresh()} disabled={loading}>다시 시도</button></div>}
      {!!data?.events.filter(event => !event.broker && event.end > today).length && <div className="notice" role="status"><Info size={18} /><span>주관사 확인이 필요한 일정이 {data.events.filter(event => !event.broker && event.end > today).length}개 있어요. 해당 일정의 상세에서 공시 원문을 확인해 주세요.</span></div>}
      {loading && !data ? <div className="loading-grid" aria-busy="true" aria-label="공모주 일정을 불러오고 있어요"><div className="skeleton main-skeleton" /><div className="skeleton calendar-skeleton" /><p>저장된 일정을 불러오고 있어요</p></div> : !data && error ? <Empty title="일정을 다시 불러와 주세요" text="연결 후 공모주 일정을 확인할 수 있어요." action={<Button onClick={() => void refresh()}>다시 불러오기</Button>} /> : <>
      {view === 'home' && <div className="home-layout subscription-first">
          <section className="featured-panel panel"><div className="section-heading"><h2>{featuredHeading}</h2>{featured && <div className="featured-controls"><span className="status-badge">{statusLabel(featured, today)}</span><button className={`save-button ${saved[featured.id] ? 'is-saved' : ''}`} aria-label={`가까운 청약 ${saved[featured.id] ? '관심 해제' : '관심 저장'}`} aria-pressed={!!saved[featured.id]} onClick={() => toggleSave(featured)}><Bookmark size={21} fill={saved[featured.id] ? 'currentColor' : 'none'} /></button></div>}</div>{featured ? <>
            <button className="featured-company" onClick={() => open(featured)}>{featured.company}<ChevronRight size={20} /></button><p className="featured-broker">{featured.broker || '주관사는 공시에서 확인해 주세요'}</p>
            <div className="featured-summary"><div className="featured-period"><span>청약일</span><strong>{dateRange(featured)}</strong></div><div className="featured-refund"><span>환불일</span><strong>{featuredRefund ? shortDate(featuredRefund) : '공시 확인 전'}</strong></div></div>
            <Button size="large" display="full" onClick={() => open(featured)}>공모가 보러가기</Button>
          </> : <Empty title="새로운 청약을 기다리고 있어요" text="이전 기록은 전체 일정에서 확인해 보세요." />}</section>
        <section className="panel calendar-panel home-calendar" aria-label="홈 공모주 캘린더">
          <Calendar month={month} selected={selected} events={events} today={today} onSelect={selectDate} onMonth={moveMonth} overview />
          <div className="home-day-heading"><h3>{shortDate(selected)} 일정</h3><button className="text-button" onClick={() => { setCalendarMode('month'); go('calendar'); }}>전체 일정 <ChevronRight size={16} /></button></div>
          <div className="home-day-list">{events.filter(e => includesDate(e, selected)).length ? events.filter(e => includesDate(e, selected)).map(e => row(e, false)) : <p className="home-day-empty">이날은 등록된 일정이 없어요.</p>}</div>
        </section>
          <section className="upcoming-section"><div className="section-heading"><h2>다가오는 일정 <span className="heading-count">{upcoming.length}</span></h2><button className="text-button" onClick={() => { setCalendarMode('list'); go('calendar'); }}>전체 보기 <ChevronRight size={16} /></button></div>{nextSaved && <button className="saved-return" onClick={() => go('saved')}><Bookmark size={18} /><span><strong>내 관심 일정</strong><span>{nextSaved.company} · {dateRange(nextSaved)}</span></span><ChevronRight size={18} /></button>}<div className="panel event-list">{upcoming.length ? upcoming.slice(0, 4).map(e => row(e)) : <Empty title="예정된 일정이 아직 없어요" text="전체 일정에서 이전 기록을 확인할 수 있어요." />}</div></section>
      </div>}
      {view === 'calendar' && <>
        <div className="calendar-toolbar"><label className="search-field"><Search size={19} /><input aria-label="종목명 또는 증권사 검색" placeholder="종목명·증권사 검색" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={16} /></button>}</label><div className="segmented" aria-label="일정 보기 방식"><button className={calendarMode === 'month' ? 'selected' : ''} aria-pressed={calendarMode === 'month'} onClick={() => setCalendarMode('month')}>달력</button><button className={calendarMode === 'list' ? 'selected' : ''} aria-pressed={calendarMode === 'list'} onClick={() => setCalendarMode('list')}>목록</button></div></div>
        <div className="filters"><div className="filter-buttons">{(['all', ...new Set(events.map(e => e.kind))] as const).map(kind => <button key={kind} className={filter === kind ? 'active' : ''} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? '전체' : kindLabels[kind]}</button>)}</div><label className="spac-filter"><input type="checkbox" checked={hideSpac} onChange={e => setHideSpac(e.target.checked)} />스팩 제외</label></div>
        <div className={`schedule-layout ${calendarMode === 'list' ? 'list-mode' : ''}`}><section className="panel calendar-panel">{calendarMode === 'month' ? <Calendar month={month} selected={selected} events={monthEvents} today={today} onSelect={selectDate} onMonth={moveMonth} /> : <><div className="calendar-heading"><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><div className="month-controls"><button className="icon-button" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button><button className="icon-button" aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button></div></div><div className="month-list-caption">조건에 맞는 일정 {monthEvents.length}개</div>{monthEvents.length ? monthEvents.map(e => row(e)) : <Empty title="조건에 맞는 일정이 없어요" text="다른 달이나 검색어로 다시 찾아보세요." />}</>}</section>{calendarMode === 'month' && <section className="selected-day-panel"><div className="section-heading"><h2>{shortDate(selected)} <span>{weekdays[new Date(`${selected}T12:00:00Z`).getUTCDay()]}요일</span></h2><span className="quiet-label">{selectedEvents.length}개 일정</span></div><div className="panel selected-list">{selectedEvents.length ? selectedEvents.map(e => row(e, false)) : <Empty title="이날은 등록된 일정이 없어요" text="표시가 있는 날짜를 눌러 확인해 보세요." />}</div></section>}</div>
      </>}
      {view === 'saved' && <><div className="saved-toolbar"><div className="segmented"><button className={savedFilter === 'upcoming' ? 'selected' : ''} aria-pressed={savedFilter === 'upcoming'} onClick={() => setSavedFilter('upcoming')}>예정된 일정</button><button className={savedFilter === 'all' ? 'selected' : ''} aria-pressed={savedFilter === 'all'} onClick={() => setSavedFilter('all')}>전체</button></div><span className="quiet-label">{savedVisible.length}개 일정</span></div><div className="saved-layout"><section className="panel saved-list">{savedVisible.length ? savedVisible.map(e => row(e)) : <Empty title={savedFilter === 'upcoming' && savedEvents.length ? '저장한 일정이 모두 종료됐어요' : '기억해 둘 공모주를 모아보세요'} text={savedEvents.length ? '전체를 누르면 이전에 저장한 일정을 볼 수 있어요.' : '일정 옆 책갈피를 누르면 여기에 모아드려요.'} action={<Button variant="weak" onClick={() => go('calendar')}>공모주 일정 둘러보기</Button>} />}</section></div></>}
      </>}
      <footer className="page-footer"><p className="collection-note">공시 일정은 6시간마다 업데이트해요.</p><div><Mark small /><strong>공모두</strong><span>공시로 확인하는 청약 일정</span></div><p>DART 증권신고서를 바탕으로 제공해요. 청약 전 주관사 공지와 공시를 확인해 주세요.</p><button className="refresh-button" onClick={() => void refresh()} disabled={loading} aria-label="일정 새로고침"><RefreshCw size={14} className={loading ? 'spinning' : ''} />{loading ? '불러오는 중' : '일정 새로고침'}</button><button onClick={() => go(`${view}/guide/1`)}>데이터 출처 및 이용 안내 <ExternalLink size={12} /></button></footer>
    </main>
    <nav className="mobile-nav" aria-label="하단 메뉴">{tabs.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}><Icon size={21} strokeWidth={view === id ? 2.3 : 1.7} /><span>{label}</span></a>)}</nav>
    {route[1] === 'event' && <Sheet title={active?.company || '일정 상세'} onClose={closeSheet}>{active ? <>
      <div className="detail-eyebrow"><span className={`kind-label ${active.kind}`}>{kindLabels[active.kind]}</span><span>{statusLabel(active, today)}</span></div><h2 className="detail-title">{active.company}</h2><p className="detail-subtitle">{active.broker || '주관사는 원본 일정을 확인해 주세요'}</p>
      {activeDateEvidence?.basis==='broker-announcement' && <p className="small-note">이 날짜의 출처는 증권사 공개 안내예요. 예정 일정은 변경될 수 있어요.</p>}
      {!events.some(e => e.id === active.id) && <div className="notice"><Info size={17} />기기에 저장한 일정이에요. 최신 일정은 원본을 확인해 주세요.</div>}
      <section className="detail-price" aria-label="공모가 정보"><h3>공모가 정보</h3><strong>{active.priceText || '아직 확인되지 않았어요'}</strong><p>{active.disclosure ? `공시 표기: ${active.disclosure.priceLabel}. 확정 여부와 단위는 공시에서 확인해 주세요.` : '이전에 저장한 가격이에요. 최신 공시에서 확인해 주세요.'}</p></section>
      <div className="detail-date"><span>{kindLabels[active.kind]} 일정</span><strong>{active.start.slice(0, 4)}. {dateRange(active)}</strong><p>{active.allDay ? '날짜 단위 일정이에요. 접수 시간은 주관사에서 확인해 주세요.' : `${new Date(active.startAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} ~ ${new Date(active.endAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`}</p></div>
      <div className="detail-section"><h3>공시로 확인한 일정</h3><div className="detail-timeline">{(['subscription', 'refund', 'listing'] as const).map(kind => { const event = related.find(e => e.kind === kind); return <div key={kind} className={event ? 'known' : ''}><i>{event ? <Check size={12} /> : null}</i><span>{kind==='listing'?'상장 예정':kindLabels[kind]}</span><strong>{event ? dateRange(event) : '공시 확인 전'}</strong></div>; })}</div></div>
      <div className="detail-section"><h3>청약 정보</h3><div className="detail-facts">
        <ListRow as="div" border="none" horizontalPadding="small" contents={<ListRow.Texts type="2RowTypeA" top="주관사" bottom={active.broker || '원본 확인 필요'} />} />
      </div>{active.disclosure && <p className="small-note">{active.disclosure.brokerSource === 'document' ? '주관사는 이 공시의 원문 인수인 표에서 확인했어요.' : active.broker ? '주관사는 공시의 인수인 정보예요.' : '주관사를 자동으로 확인하지 못했어요. 아래 공시 원문에서 확인해 주세요.'} 일반청약 가능 여부는 증권사 공지를 확인해 주세요.</p>}</div>

      {active.kind === 'subscription' && <PreparationChecklist key={active.id} event={active} />}
      <details className="disclosure-details"><summary>공시와 날짜 확인 근거</summary>{active.disclosure && <div className="detail-section"><h3>날짜 확인 근거</h3>{(['refund','listing'] as const).map(kind=>{const evidence=active.disclosure?.[kind];return evidence?<div className="date-evidence" key={kind}><strong>{kind==='refund'?'환불일':'상장 예정일'} · {evidence.date}</strong><p>{evidence.quote}</p><a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.basis==='broker-announcement'?'증권사 일정 안내':`근거 공시 ${evidence.receiptNo}`} <ExternalLink size={12}/></a></div>:<p className="small-note" key={kind}>{kind==='refund'?'환불일':'상장 예정일'}: 공시 원문에서 확인하지 못했어요.</p>;})}</div>}
      {active.disclosure?.ipoEvidence && <p className="small-note"><a href={active.disclosure.ipoEvidence.sourceUrl} target="_blank" rel="noreferrer">상장 공모 근거 공시 {active.disclosure.ipoEvidence.receiptNo} <ExternalLink size={12} /></a></p>}
      <div className="detail-section"><h3>공시 정보</h3>{active.disclosure ? <dl><div><dt>접수일</dt><dd>{active.disclosure.filedOn}</dd></div><div><dt>접수번호</dt><dd>{active.disclosure.receiptNo}</dd></div><div><dt>보고서</dt><dd>{active.disclosure.reportName}</dd></div><div><dt>납입기일</dt><dd>{active.disclosure.paymentText || '공시 확인 필요'}</dd></div><div><dt>배정공고일</dt><dd>{active.disclosure.allocationText || '공시 확인 필요'}</dd></div></dl> : <p className="small-note">이전 캘린더에서 저장한 기록이에요. DART 공시 데이터로 검증한 일정이 아니에요.</p>}<p className="small-note">납입기일은 환불일과 달라요. 상장일·환불일은 추정하지 않아요.</p></div>
      <details className="original-event"><summary>{active.disclosure ? '원본 공시 정보 보기' : '이전 출처 원문 보기'}</summary><p>{active.title}</p>{active.description && <p>{active.description}</p>}<a href={active.disclosure?.sourceUrl || 'https://calendar.google.com/calendar/embed?src=gjbox0301%40gmail.com'} target="_blank" rel="noreferrer">{active.disclosure ? 'DART 증권신고서 원문 열기' : '이전 Google 캘린더 열기'} <ExternalLink size={14} /></a></details></details>
      <div className="detail-actions"><Button display="full" size="large" variant={saved[active.id] ? 'weak' : 'fill'} aria-label={`${active.company} 상세 관심 ${saved[active.id] ? '해제' : '저장'}`} aria-pressed={!!saved[active.id]} onClick={() => toggleSave(active)}><Bookmark size={19} fill={saved[active.id] ? 'currentColor' : 'none'} /> {saved[active.id] ? '관심 일정에서 해제하기' : '관심 일정에 저장하기'}</Button>{active.disclosure && <a className="detail-source" href={active.disclosure.sourceUrl} target="_blank" rel="noreferrer">DART 공시 원문 보기 <ExternalLink size={15} /><span className="sr-only"> (외부 페이지)</span></a>}</div>
    </> : loading ? <div className="detail-loading" role="status" aria-busy="true">저장된 일정을 불러오고 있어요</div> : error && !data ? <Empty title="일정을 다시 불러와 주세요" text="연결 후 상세 일정을 확인할 수 있어요." action={<Button onClick={() => void refresh()}>다시 불러오기</Button>} /> : <Empty title="이 일정을 찾을 수 없어요" text="일정이 변경됐을 수 있어요. 전체 일정에서 다시 확인해 주세요." action={<Button onClick={closeSheet}>일정으로 돌아가기</Button>} />}</Sheet>}
    {route[1] === 'guide' && <Sheet title="공모두 이용 안내" onClose={closeSheet}><div className="guide-tabs">{guides.map((g, i) => <button className={Number(route[2] || 0) === i ? 'active' : ''} key={g.eyebrow} onClick={() => go(`${view}/guide/${i}`)}>{g.eyebrow}</button>)}</div>{(() => { const guide = guides[Number(route[2])] || guides[0]; return <><h2 className="detail-title">{guide.title}</h2><p className="guide-intro">{guide.intro}</p><div className="guide-steps">{guide.steps.map(([title, text], i) => <div key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div>{guide === guides[1] && <a className="source-external" href={data?.source.url || 'https://dart.fss.or.kr/dsac008/main.do'} target="_blank" rel="noreferrer">DART 청약 달력에서 직접 확인하기 <ExternalLink size={16} /></a>}<Button display="full" size="large" onClick={closeSheet}>확인했어요</Button></>; })()}</Sheet>}
    {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
  </div>;
}
