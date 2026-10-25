import { createFeed } from '../server/feed.ts';
import { DartError } from '../server/dart/client.ts';
try {
  const result = await createFeed().sync();
  console.log(JSON.stringify({ source: result.source.name, events: result.events.length, fetchedAt: result.fetchedAt, coverage: result.coverage, quality: result.quality }, null, 2));
} catch (error) {
  console.error(error instanceof DartError ? error.code : 'DART_SYNC_FAILED');
  process.exitCode = 1;
}
