import { Parser } from 'htmlparser2';
import { unzipSync } from 'fflate';
import { addDays } from '../../shared/schedule.ts';

export class DartError extends Error {
  constructor(public code: string) { super(code); this.name = 'DartError'; }
}
export interface DartReport {
  corp_code: string; corp_name: string; corp_cls: string;
  rcept_no: string; rcept_dt: string; report_nm: string; rm: string;
}
export type DartRow = Record<string, string>;
export interface DartGroup { title: string; list: DartRow[] }
export interface DartDocument { text: string; tables: string[][][]; tableOffsets?: number[] }
const compact = (date: string) => date.replaceAll('-', '');
export function dateWindows(start: string, end: string) {
  const result: { start: string; end: string }[] = [];
  for (let day = start; day <= end;) {
    const finish = [addDays(day, 88), end].sort()[0];
    result.push({ start: day, end: finish }); day = addDays(finish, 1);
  }
  return result;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function readGroups(value: unknown): DartGroup[] {
  if (!record(value) || typeof value.status !== 'string') throw new DartError('DART_BAD_RESPONSE');
  if (value.status === '013') return [];
  if (value.status !== '000') throw new DartError(`DART_${/^\d{3}$/.test(value.status) ? value.status : 'BAD_RESPONSE'}`);
  if (!Array.isArray(value.group)) throw new DartError('DART_BAD_RESPONSE');
  return value.group.map(group => {
    if (!record(group) || typeof group.title !== 'string' || !Array.isArray(group.list) || !group.list.every(record)) throw new DartError('DART_BAD_RESPONSE');
    return { title: group.title, list: group.list.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v)]))) };
  });
}
export function documentData(buffer: Uint8Array): DartDocument {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const text = new TextDecoder().decode(buffer);
    const code = text.match(/<status>(\d{3})<\/status>/)?.[1];
    throw new DartError(code ? `DART_${code}` : 'DART_BAD_DOCUMENT');
  }
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, { filter: entry => {
      if (!/\.xml$/i.test(entry.name)) return false;
      total += entry.originalSize;
      if (entry.originalSize > 20_000_000 || total > 30_000_000) throw new DartError('DART_DOCUMENT_TOO_LARGE');
      return true;
    } });
  } catch (error) { if (error instanceof DartError) throw error; throw new DartError('DART_BAD_DOCUMENT'); }
  const xmls = Object.values(files);
  if (xmls.length !== 1) throw new DartError('DART_DOCUMENT_AMBIGUOUS');
  const bytes = xmls[0];
  const header = new TextDecoder().decode(bytes.subarray(0, 160));
  const encoding = /encoding=["'](?:euc-kr|ks_c_5601-1987)["']/i.test(header) ? 'euc-kr' : 'utf-8';
  try {
    const xml = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    // DART originals mix XML and legacy HTML tags (including paired IMG/BR).
    // Stream text in source order without building a deeply nested DOM or expanding DTDs.
    const pieces: string[] = [];
    const tables: string[][][] = [];
    const tableOffsets: number[] = [];
    let offset = 0;
    const stack: { rows: string[][]; row: string[] | null; cell: string | null; cellTag: string | null; offset: number }[] = [];
    const parser = new Parser({
      onopentag: name => {
        const tag = name.toUpperCase();
        if (tag === 'TABLE') stack.push({ rows: [], row: null, cell: null, cellTag: null, offset });
        const context = stack.at(-1);
        if (context && tag === 'TR') context.row = [];
        if (context?.row && ['TD','TH','TE'].includes(tag)) { context.cell = ''; context.cellTag = tag; }
      },
      ontext: value => { pieces.push(value); offset += value.length; const context = stack.at(-1); if (context?.cell != null) context.cell += value; },
      onclosetag: name => {
        pieces.push('\n'); offset++; const tag = name.toUpperCase(); const context = stack.at(-1);
        if (!context) return;
        if (tag === context.cellTag) { context.row?.push((context.cell || '').replace(/\s+/g,' ').trim()); context.cell = null; context.cellTag = null; }
        if (tag === 'TR' && context.row) { context.rows.push(context.row); context.row = null; }
        if (tag === 'TABLE') { if (context.rows.length) { tables.push(context.rows); tableOffsets.push(context.offset); } stack.pop(); }
      },
    }, { xmlMode: true, decodeEntities: true });
    parser.end(xml);
    return { text: pieces.join('').replace(/\u00a0/g, ' '), tables, tableOffsets };
  } catch { throw new DartError('DART_BAD_DOCUMENT'); }
}
export const documentText = (buffer: Uint8Array) => documentData(buffer).text;

/** Only official OpenDART endpoints. The key is never returned or included in errors. */
export function createDartClient(key: string, fetcher: typeof fetch = fetch, delayMs = 200) {
  let lastRequest = 0;
  async function request(path: string, params: Record<string, string>, binary = false) {
    const delay = Math.max(0, delayMs - (Date.now() - lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequest = Date.now();
    const url = new URL(`https://opendart.fss.or.kr/api/${path}`);
    url.search = new URLSearchParams({ ...params, crtfc_key: key }).toString();
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { Accept: binary ? 'application/zip' : 'application/json' } });
      if (!response.ok) throw new DartError('DART_NETWORK');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > (binary ? 8_000_000 : 5_000_000)) throw new DartError('DART_RESPONSE_TOO_LARGE');
      return bytes;
    } catch (error) { if (error instanceof DartError) throw error; throw new DartError('DART_NETWORK'); }
  }
  async function json(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(await request(path, params)));
      if (!record(value) || typeof value.status !== 'string') throw new DartError('DART_BAD_RESPONSE');
      if (value.status !== '000' && value.status !== '013') throw new DartError(`DART_${/^\d{3}$/.test(value.status) ? value.status : 'BAD_RESPONSE'}`);
      return value;
    } catch (error) { if (error instanceof DartError) throw error; throw new DartError('DART_BAD_RESPONSE'); }
  }
  return {
    async reports(start: string, end: string, corpCode?: string) {
      const reports = new Map<string, DartReport>();
      for (const window of dateWindows(start, end)) {
        let pages = 1;
        for (let page = 1; page <= pages; page++) {
          const value = await json('list.json', { bgn_de: compact(window.start), end_de: compact(window.end), pblntf_detail_ty: 'C001', last_reprt_at: corpCode ? 'N' : 'Y', ...(corpCode ? {corp_code:corpCode} : {}), sort: 'date', sort_mth: 'desc', page_count: '100', page_no: String(page) });
          if (value.status === '013') break;
          pages = Number(value.total_page);
          if (!Number.isInteger(pages) || pages < 1 || pages > 100 || !Array.isArray(value.list)) throw new DartError('DART_BAD_RESPONSE');
          for (const row of value.list) {
            if (!record(row) || !/^\d{8}$/.test(String(row.corp_code)) || !/^\d{14}$/.test(String(row.rcept_no)) || !/^\d{8}$/.test(String(row.rcept_dt)) || typeof row.corp_name !== 'string' || typeof row.report_nm !== 'string' || typeof row.corp_cls !== 'string') throw new DartError('DART_BAD_RESPONSE');
            const report = { ...row, rm: typeof row.rm === 'string' ? row.rm : '' } as unknown as DartReport;
            reports.set(report.rcept_no, report);
          }
        }
      }
      return [...reports.values()];
    },
    async equity(corpCode: string, start: string, end: string) {
      return readGroups(await json('estkRs.json', { corp_code: corpCode, bgn_de: compact(start), end_de: compact(end) }));
    },
    async document(receipt: string) { return documentData(await request('document.xml', { rcept_no: receipt }, true)); },
  };
}
