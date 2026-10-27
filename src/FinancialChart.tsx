import { useEffect, useRef, useState } from 'react';
import type { CompanySummary } from '../shared/schedule';
import { chartNumber, financialChartData, financialNumber, financialPeriod } from './financial-chart';

export default function FinancialChart({ summary }: { summary: CompanySummary }) {
  const { rows, metrics, divisor, unit, low, high, ticks } = financialChartData(summary);
  const [selection, setSelection] = useState(rows.length - 1);
  const root = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const selected = Math.min(selection, rows.length - 1);
  if (!metrics.length) return <p>차트로 비교할 수 있는 재무 수치를 아직 확인하지 못했어요.</p>;
  const row = rows[selected];
  // 48px axis + equal period groups + 8px end gutter. More than four periods scroll inside the chart.
  const width = Math.max(containerWidth, 48 + rows.length * 60 + 8), height = 210;
  const groupWidth = (width - 56) / rows.length;
  const y = (value: number) => 16 + (high - value) / (high - low) * 174;
  const baseline = y(0), barWidth = Math.min(16, (groupWidth - 18) / metrics.length);
  return <div className="financial-chart" ref={root}>
    <div className="financial-chart-legend">{metrics.map(metric => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}<span className="financial-chart-unit">단위: {unit}</span></div>
    <div className="financial-chart-scroll">
      <svg className="financial-chart-plot" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label="기간별 매출·이익 비교 차트. 0 아래 막대는 손실이에요.">
        {ticks.map(tick => <g key={tick}><line x1="48" x2={width - 8} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? '#8793a2' : '#e9edf0'} /><text x="40" y={y(tick) + 4} textAnchor="end">{chartNumber(tick)}</text></g>)}
        {rows.map((period, index) => <g key={`${period.period}-${index}`}>
          {metrics.map((metric, metricIndex) => {
            const value = financialNumber(period[metric.key]);
            if (value === null) return null;
            const scaled = value / divisor, x = 48 + groupWidth * (index + .5) + (metricIndex - metrics.length / 2) * (barWidth + 3);
            return <rect key={metric.key} x={x} y={Math.min(y(scaled), baseline)} width={barWidth} height={Math.abs(y(scaled) - baseline)} fill={metric.color}><title>{period.period} {metric.label}: {period[metric.key]} {summary.unit}</title></rect>;
          })}
        </g>)}
      </svg>
      <div className="financial-chart-periods" style={{ minWidth: width, gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }} aria-label="재무 기간 선택">{rows.map((period, index) => {
        const label = financialPeriod(period.period);
        return <button key={`${period.period}-${index}`} type="button" aria-label={`${period.period} 실적 보기`} aria-pressed={index === selected} onClick={() => setSelection(index)}><span>{label.year}</span>{label.suffix && <small>{label.suffix}</small>}</button>;
      })}</div>
    </div>
    <div className="financial-chart-detail" aria-live="polite" aria-atomic="true"><p>{row.period}</p><dl>{metrics.map(metric => {
      const value = financialNumber(row[metric.key]);
      return <div key={metric.key}><dt>{metric.label}</dt><dd title={`${row[metric.key] ?? '미확인'} ${summary.unit || ''}`} className={value !== null && value < 0 ? 'is-loss' : undefined}>{value === null ? '미확인' : <>{chartNumber(value / divisor)}<small>{unit}</small></>}</dd></div>;
    })}</dl>{row.accounting && <p className="financial-accounting">{row.accounting}</p>}</div>
    <p className="small-note financial-chart-note">0 아래는 손실이에요.</p>
  </div>;
}
