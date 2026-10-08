// Request URLs can carry secrets: email verification tokens and OAuth codes
// travel in query strings, and password reset tokens in the path. Logs keep
// the path (minus those tokens) and drop the query string.

const TOKEN_IN_PATH = /(\/reset-password\/)[^/?#]+/;

export function redactUrl(url: string): string {
  const queryStart = url.search(/[?#]/);
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const redactedPath = path.replace(TOKEN_IN_PATH, '$1[Redacted]');
  return queryStart === -1 ? redactedPath : `${redactedPath}?[Redacted]`;
}

interface LoggableRequest {
  method?: string;
  url?: string;
  ip?: string;
  host?: string;
}

/** Replaces Fastify's default request serializer, which logs the full URL. */
export function serializeRequest(req: LoggableRequest) {
  return {
    method: req.method,
    url: req.url === undefined ? undefined : redactUrl(req.url),
    host: req.host,
    remoteAddress: req.ip,
  };
}
