import { Request, Response, NextFunction } from 'express';

// Placeholder for Phase 1 - Role-based access control
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log('[Phase 1 TODO] requireRole middleware - not implemented yet');
    next();
  };
};
