import { BadgeAlert, BadgeCheck, Send, UserRound } from 'lucide-react';
import { ACCOUNT_STATUS, USER_ROLES, type AccountStatus, type AdminUser, type UserRole } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ROLE_LABELS, STATUS_LABELS } from '../roles';

// The users tables' cells and badges, shared by every tab's rows and phone cards (DESIGN.md §2.2)

const STATUS_VARIANTS: Record<AccountStatus, BadgeProps['variant']> = {
  [ACCOUNT_STATUS.ACTIVE]: 'success',
  [ACCOUNT_STATUS.PENDING]: 'warning',
  [ACCOUNT_STATUS.REJECTED]: 'destructive',
};

/** Active / Pending / Rejected, drawn like the stock-status badge (a tint with a dot). */
export function UserStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className="gap-1.5 rounded-md font-medium">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** The status badge, with the reason under it on a rejected account. */
export function UserStatus({ user }: { user: AdminUser }) {
  return (
    <div className="space-y-1">
      <UserStatusBadge status={user.status} />
      {user.status === ACCOUNT_STATUS.REJECTED && user.statusReason && (
        <p className="text-xs text-muted-foreground">{user.statusReason}</p>
      )}
    </div>
  );
}

/** Admin in violet with a check badge; Staff muted with a person icon. */
export function RoleBadge({ role }: { role: UserRole }) {
  const admin = role === USER_ROLES.ADMIN;
  const Icon = admin ? BadgeCheck : UserRound;
  return (
    <Badge variant={admin ? 'violet' : 'secondary'} className="gap-1 rounded-md font-medium">
      <Icon className="size-3.5" aria-hidden />
      {ROLE_LABELS[role]}
    </Badge>
  );
}

/** A muted "Verified" line, or a destructive "Unverified" badge. */
export function EmailVerification({ verified }: { verified: boolean }) {
  return verified ? (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <BadgeCheck className="size-3.5" aria-hidden />
      Verified
    </p>
  ) : (
    <Badge variant="destructive" className="gap-1 rounded-md font-medium">
      <BadgeAlert className="size-3.5" aria-hidden />
      Unverified
    </Badge>
  );
}

/** The address with its verification under it. */
export function UserEmail({ user }: { user: AdminUser }) {
  return (
    <div className="space-y-1">
      <p className="break-all">{user.email}</p>
      <EmailVerification verified={user.emailVerified} />
    </div>
  );
}

/** "@handle" when the linked Telegram account has one, "Linked" when it has none, "—" when not linked. */
export function UserTelegram({ user }: { user: AdminUser }) {
  if (!user.telegramLinked) {
    return (
      <span className="text-muted-foreground" aria-label="Not linked">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Send className="size-3.5 text-muted-foreground" aria-hidden />
      {user.telegramUsername ? `@${user.telegramUsername}` : 'Linked'}
    </span>
  );
}
