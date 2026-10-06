import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

/** Validates req.body against a Zod schema and replaces it with the parsed value. */
export const validate = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};
