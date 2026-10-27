import type { DemandForecast, SubscriptionResult } from '../../shared/schedule.ts';
import type { DartDocument } from './client.ts';

const compact = (s: string | undefined) => (s ?? '').replace(/\s/g, '');
/** '1,045' → 1045, '1,160.70' → 1160.7. Dashes, blanks and text stay null instead of becoming 0. */
export function tableNumber(cell: string | undefined): number | null {
  const v = compact(cell);
  if (!/^\d[\d,]*(?:\.\d+)?$/.test(v)) return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
const count = (cell: string | undefined) => compact(cell) === '-' ? 0 : tableNumber(cell);
// Price labels use thousands commas, and some filings mistype them as periods ('15.800원').
const labelPrice = (label: string) => { const m = label.match(/(\d{1,3}(?:[,.]\d{3})+|\d+)\s*원?/); return m ? Number(m[1].replace(/[,.]/g, '')) : null; };
const sourceUrl = (receiptNo: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`;
const rowBy = (table: string[][], re: RegExp) => table.find(row => re.test(compact(row[0])));
const totalRow = /^(?:합계|계|총계|총합계)$/;

/**
 * Institutional demand-forecast result from a final-terms filing ([발행조건확정]증권신고서).
 * The summary table's last column is the total: 건수 / 수량 / 경쟁률. Anything ambiguous is null.
 */
export function demandForecast(document: DartDocument, receiptNo: string): DemandForecast | null {
  const found = document.tables.flatMap(table => {
    const n = rowBy(table, /^건수$/), q = rowBy(table, /^수량$/), r = rowBy(table, /^경쟁률/);
    if (!n || !q || !r) return [];
    const participants = tableNumber(n.at(-1)), quantity = tableNumber(q.at(-1)), ratio = tableNumber(r.at(-1));
    return participants && quantity && ratio && Number.isInteger(participants) ? [{ participants, quantity, ratio }] : [];
  });
  if (!found.length || new Set(found.map(f => JSON.stringify(f))).size !== 1) return null;
  const { participants, quantity, ratio } = found[0];

  // Price distribution: only accept the table whose 합계 count matches the participants above.
  let band: DemandForecast['band'] = null, aboveUpperShare: number | null = null;
  for (const table of document.tables) {
    if (!/참여건수/.test(table.flat().join(' '))) continue;
    const total = rowBy(table, totalRow);
    if (!total || count(total[1]) !== participants) continue;
    const priced = table.filter(row => row.length >= 5 && /원|\d/.test(row[0]) && !/미제시|구분|참여건수/.test(compact(row[0])) && !totalRow.test(compact(row[0])))
      .map(row => ({ label: compact(row[0]), price: labelPrice(row[0]), bids: count(row[1]) }));
    if (priced.length < 3 || priced.some(row => row.price === null || row.bids === null)) continue;
    const high = Math.max(...priced.map(row => row.price!)), low = Math.min(...priced.map(row => row.price!));
    // A fixed-price offering (SPAC) has no band, so 'at or above the top' would be meaningless.
    if (!(low > 0 && low < high)) break;
    const above = priced.filter(row => row.price === high && !/미만/.test(row.label)).reduce((sum, row) => sum + row.bids!, 0);
    band = { low, high }; aboveUpperShare = above / participants;
    break;
  }

  // Lock-up commitments by requested quantity: the table whose 합계 quantity equals the total demand.
  let committedShare: number | null = null;
  for (const table of document.tables) {
    const total = rowBy(table, totalRow), open = rowBy(table, /^미확약$/);
    if (!total || !open || total.length !== open.length || tableNumber(total.at(-2)) !== quantity) continue;
    const uncommitted = count(open.at(-2));
    if (uncommitted === null || uncommitted > quantity) continue;
    committedShare = (quantity - uncommitted) / quantity;
    break;
  }
  return { ratio, participants, band, aboveUpperShare, committedShare, receiptNo, sourceUrl: sourceUrl(receiptNo) };
}

/**
 * Retail subscription result from the issue-results report (증권발행실적보고서).
 * Each lead manager's allocation table is summed; the ratio is total subscribed ÷ total allocated.
 */
export function subscriptionResult(document: DartDocument, receiptNo: string): SubscriptionResult | null {
  const seen = new Set<string>();
  let applicants = 0, subscribed = 0, equal = 0, allocated = 0, tables = 0;
  for (const table of document.tables) {
    const key = JSON.stringify(table);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = compact(table.flat().join(' '));
    if (!/청약건수/.test(text) || !/균등/.test(text) || !/비례/.test(text)) continue;
    // Header rows are merged-cell fragments that differ by broker; data rows are a fixed
    // 15-column layout: unit, applicants, subscribed (A), …, equal (B) @7, proportional (C) @12, D @13.
    const cells = (row: string[]) => [tableNumber(row[1]), tableNumber(row[2]), count(row[7]), count(row[12]), count(row[13])];
    const valid = (v: (number | null)[]) => v.every(n => n !== null) && v[0]! > 0 && v[1]! > 0 && v[2]! + v[3]! === v[4]! && v[4]! > 0;
    const total = rowBy(table, totalRow);
    let sums: number[] | null = null;
    if (total && total.length >= 14) { const v = cells(total); if (!valid(v)) return null; sums = v as number[]; }
    else if (!total) {
      // Some brokers omit the total row: sum unit rows, each of which must itself balance.
      const units = table.filter(row => row.length >= 14 && /^\d[\d,]*주?$/.test(compact(row[0])));
      if (units.length < 3 || !units.every(row => valid(cells(row)))) continue;
      sums = units.map(row => cells(row) as number[]).reduce((acc, v) => acc.map((n, i) => n + v[i]), [0, 0, 0, 0, 0]);
    }
    if (!sums) continue;
    const [a, q, b, , d] = sums;
    applicants += a; subscribed += q; equal += b; allocated += d; tables++;
  }
  if (!tables) return null;

  let committedShare: number | null = null;
  const lockup = document.tables.find(table => /^확약기간$/.test(compact(table[0]?.[0])));
  if (lockup) {
    const total = rowBy(lockup, totalRow), open = rowBy(lockup, /^미확약$/);
    const all = tableNumber(total?.at(-2)), uncommitted = count(open?.at(-2));
    if (all && uncommitted !== null && uncommitted <= all) committedShare = (all - uncommitted) / all;
  }
  return { ratio: subscribed / allocated, applicants, equalSharesPerApplicant: equal / applicants, committedShare, receiptNo, sourceUrl: sourceUrl(receiptNo) };
}
