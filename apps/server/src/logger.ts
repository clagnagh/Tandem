import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { serializeRequest } from './log-redaction.ts';

/**
 * Structured JSON logs. Redaction is a safety net: request bodies are never
 * logged, but if a header or body ever is, secrets come out as "[Redacted]".
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level,
    serializers: { req: serializeRequest },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.newPassword',
        '*.currentPassword',
        '*.token',
      ],
      censor: '[Redacted]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
