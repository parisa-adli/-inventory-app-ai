export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

/** `retryAfter` (seconds) is only known to the Mongo limiter; the IP limiter sends the Retry-After header itself. */
export class RateLimitedError extends AppError {
  constructor(public retryAfter?: number) {
    super(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }
}

/** MongoDB's E11000: a unique index rejected the write. */
export const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number } | null)?.code === 11000;
