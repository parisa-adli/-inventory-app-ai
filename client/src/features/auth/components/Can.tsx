import type { ReactNode } from 'react';
import type { Permission } from '@inventory/shared';
import { useCan } from '../hooks/useCan';

interface CanProps {
  permission: Permission;
  children: ReactNode;
  /** Rendered instead when the user lacks the permission (nothing by default). */
  fallback?: ReactNode;
}

/** Renders its children only for users whose role grants `permission`. */
export function Can({ permission, children, fallback = null }: CanProps) {
  return useCan(permission) ? children : fallback;
}
