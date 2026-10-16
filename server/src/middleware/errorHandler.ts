import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, RateLimitedError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-arg signature
  next: NextFunction
) => {
  // Expected client errors (401, 409, 429 ...) are not worth a stack trace
  if (!(err instanceof AppError) || err.statusCode >= 500) console.error('Error:', err);

  if (err instanceof AppError) {
    const details =
      err instanceof RateLimitedError && err.retryAfter ? { retryAfter: err.retryAfter } : err.details;
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(details && { details }),
      },
    });
  }

  // Handle Zod request-validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues.map((i) => `${i.path.map(String).join('.') || 'body'}: ${i.message}`).join('; '),
      },
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'Invalid ID format',
      },
    });
  }

  // Default error
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
