import type { CompanySummary } from '../shared/schedule';
import { chartNumber, financialChartData, financialNumber, financialPeriod } from './financial-chart';

export interface Kpi { label: string; value: string; note: string | null; tone: 'up' | 'down' | 'neutral' }
export interface ReportFacts { period: string | null; kpis: Kpi[]; insights: string[] }

// Disclosed numbers only. A metric is shown when its own source cells parse; nothing is filled in.
export function companyReport(summary: CompanySummary): ReportFacts {
  const { rows, divisor, unit } = financialChartData(summary);
  const money = (value: number) => `${chartNumber(value / divisor)}${unit}`;
  const annual = rows.filter(row => !financialPeriod(row.period).suffix);
  const latest = rows.at(-1);
  const year = annual.at(-1) ?? latest, prior = annual.length ? annual.at(-2) : undefined;
  const revenue = financialNumber(year?.revenue), priorRevenue = financialNumber(prior?.revenue);
  const operating = financialNumber(year?.operatingProfit), net = financialNumber(year?.netIncome);
  const kpis: Kpi[] = [];
  if (year && revenue !== null) {
    const growth = priorRevenue && priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue * 100 : null;
    kpis.push({ label: '매출', value: money(revenue), note: growth === null ? null : `${label(prior!.period)}보다 ${growth >= 0 ? '▲' : '▼'} ${percent(Math.abs(growth))}`, tone: growth === null ? 'neutral' : growth >= 0 ? 'up' : 'down' });
  }
  if (year && operating !== null) kpis.push({ label: '영업이익', value: money(operating), note: revenue && revenue > 0 ? `영업이익률 ${percent(operating / revenue * 100)}` : null, tone: operating < 0 ? 'down' : 'neutral' });
  if (year && net !== null) kpis.push({ label: '순이익', value: money(net), note: net < 0 ? '순손실' : null, tone: net < 0 ? 'down' : 'neutral' });

  const insights: string[] = [];
  const revenues = annual.map(row => financialNumber(row.revenue));
  if (revenues.length >= 3 && revenues.every((v, i) => v !== null && (i === 0 || v > revenues[i - 1]!))) insights.push(`매출이 ${revenues.length}년 연속 늘었어요.`);
  const profits = annual.map(row => financialNumber(row.operatingProfit));
  const [beforeProfit, lastProfit] = [profits.at(-2), profits.at(-1)];
  if (beforeProfit != null && lastProfit != null && beforeProfit < 0 && lastProfit > 0) insights.push(`${label(year!.period)}에 영업이익이 흑자로 바뀌었어요.`);
  else if (beforeProfit != null && lastProfit != null && beforeProfit > 0 && lastProfit < 0) insights.push(`${label(year!.period)}에 영업손실로 바뀌었어요.`);
  else if (profits.length >= 2 && profits.every(v => v !== null && v < 0)) insights.push(`최근 ${profits.length}년 모두 영업손실이에요.`);
  if (latest && latest !== year) {
    const interim = financialNumber(latest.operatingProfit);
    if (interim !== null) insights.push(`${label(latest.period)} 영업${interim < 0 ? '손실' : '이익'}은 ${money(Math.abs(interim))}이에요.`);
  }
  return { period: year ? label(year.period) : null, kpis, insights };
}
// '2025년(제29기)' reads as '2025년' in a sentence; the chart keeps the filing's full label.
const label = (period: string) => period.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
const percent = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
