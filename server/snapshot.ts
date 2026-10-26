import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isScheduleEvent, type ScheduleResponse } from '../shared/schedule.ts';

export const snapshotPath = () => process.env.DART_SNAPSHOT_PATH || '.cache/dart-schedule.json';
export function validateSnapshot(value: unknown): ScheduleResponse {
  const saved = value as { version?: number; data?: ScheduleResponse } | null;
  const data = saved?.data;
  if (saved?.version !== 3 || !data || !Array.isArray(data.events)
    || !data.events.every(e => isScheduleEvent(e) && e.disclosure)
    || !Number.isFinite(Date.parse(data.fetchedAt)) || typeof data.source?.name !== 'string'
    || typeof data.source?.url !== 'string') throw new Error('SCHEDULE_UNAVAILABLE');
  // Legacy clients interpret stale as an upstream error. Batch snapshots do not expire.
  // fetchedAt remains the actual collection time, including during upstream outages.
  return { ...data, stale: false };
}
export async function publishSnapshot(path: string, data: ScheduleResponse) {
  const saved = { version: 3, data };
  validateSnapshot(saved);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(saved), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
/** Read-only API boundary: no DART client, key, TTL, retry or collection dependency. */
export function createSnapshotReader(path = snapshotPath()) {
  let lastGood: ScheduleResponse | undefined;
  let pending: Promise<ScheduleResponse> | undefined;
  const read = async () => {
    if (!pending) pending = (async () => {
      try { lastGood = validateSnapshot(JSON.parse(await readFile(path, 'utf8'))); }
      catch { /* A failed publication/read keeps the last verified snapshot in memory. */ }
      if (!lastGood) throw new Error('SCHEDULE_UNAVAILABLE');
      return lastGood;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return Object.assign(read, { status: async () => {
    const data = await read().catch(() => undefined);
    return { source: 'dart', mode: 'scheduled-snapshot', collectionIntervalHours: 6,
      available: !!data, lastFetchedAt: data?.fetchedAt ?? null, events: data?.events.length ?? 0 };
  } });
}
