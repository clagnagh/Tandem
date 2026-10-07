// Typed application errors. Services throw these; the central error handler
// (src/plugins/error-handler.ts) turns them into JSON responses.

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'bad_request') {
    super(400, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in required') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(403, 'forbidden', message);
  }
}

/**
 * Also used when the caller may not know a resource exists: answering 404
 * rather than 403 avoids confirming that another workspace's id is real.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'conflict') {
    super(409, code, message);
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, 'rate_limited', 'Too many attempts. Try again later.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A dependency we need (Redis, email) is down; the client may retry later. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Temporarily unavailable') {
    super(503, 'unavailable', message);
  }
}
