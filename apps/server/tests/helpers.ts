import { Writable } from 'node:stream';
import { createLogger } from '../src/logger.ts';

/** A real pino logger whose output is captured as parsed JSON lines. */
export function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      callback();
    },
  });
  const logger = createLogger('debug', stream);
  return { logger, text: () => lines.join('\n') };
}
