import { Request, Response, NextFunction } from 'express';

// Placeholder for Phase 1 - JWT verification middleware
export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log('[Phase 1 TODO] verifyToken middleware - not implemented yet');
  next();
};
