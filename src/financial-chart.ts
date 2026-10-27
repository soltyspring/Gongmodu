import type { CompanySummary } from '../shared/schedule';

export const financialMetrics = [
  { key: 'revenue', label: '매출', color: 'var(--accent)' },
  { key: 'operatingProfit', label: '영업이익', color: '#465366' },
  { key: 'netIncome', label: '순이익', color: '#8793a2' },
] as const;

// A missing or unfamiliar filing value must never become a zero in the chart.
export function financialNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const clean = text.replace(/[,\s]/g, '').replace(/−/g, '-');
  if (!/^(?:[+-]?\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\))$/.test(clean)) return null;
  const value = clean.startsWith('(') ? -Number(clean.slice(1, -1)) : Number(clean);
  return Number.isFinite(value) ? value : null;
}

export function financialPeriod(period: string) {
  const year = period.match(/(?:19|20)\d{2}/)?.[0];
  const quarter = period.match(/[1-4]\s*분기/)?.[0].replace(/\s/g, '');
  const month = period.match(/(?:19|20)\d{2}\s*년?\s*(\d{1,2})\s*월/)?.[1];
  const suffix = quarter || (period.includes('반기') ? '반기' : month ? `${Number(month)}월말` : '');
  return { year: year ? `${year}년` : period, suffix, order: Number(year || 0) * 100 + (quarter ? Number(quarter[0]) * 3 : period.includes('반기') ? 6 : Number(month || 12)) };
}

export function financialChartData(summary: CompanySummary) {
  const rows = [...summary.financials].sort((a, b) => financialPeriod(a.period).order - financialPeriod(b.period).order);
  const metrics = financialMetrics.filter(metric => rows.some(row => financialNumber(row[metric.key]) !== null));
  const values = rows.flatMap(row => metrics.map(metric => financialNumber(row[metric.key])).filter((v): v is number => v !== null));
  const sourceFactor: Record<string, number> = { 원: 1, 천원: 1000, 백만원: 1e6, 억원: 1e8 };
  const factor = sourceFactor[(summary.unit || '').replace(/\s/g, '')];
  const largestWon = Math.max(0, ...values.map(Math.abs)) * (factor || 1);
  const divisor = factor ? largestWon >= 1e8 ? 1e8 / factor : largestWon >= 1e4 ? 1e4 / factor : 1 / factor : 1;
  const unit = factor ? largestWon >= 1e8 ? '억원' : largestWon >= 1e4 ? '만원' : '원' : summary.unit || '공시 단위';
  const scaled = values.map(v => v / divisor);
  const max = Math.max(0, ...scaled), min = Math.min(0, ...scaled);
  const extent = Math.max(max - min, Math.abs(max), Math.abs(min));
  const rough = extent ? extent / 4 : 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(n => n * power).find(n => n >= rough)!;
  const low = Math.floor(min / step) * step;
  const high = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + step * i);
  return { rows, metrics, divisor, unit, low, high, ticks };
}

export function chartNumber(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 2 : 1 });
}
