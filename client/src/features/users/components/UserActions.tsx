import { ACCOUNT_STATUS, type AdminUser } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** What the page passes to every row and card: the handlers, and which mutations are running. */
export interface UserActionHandlers {
  /** The signed-in admin, who is never offered revoking themselves. */
  meId: string | undefined;
  onActivate: (user: AdminUser) => void;
  onReactivate: (user: AdminUser) => void;
  /** Opens the confirmation: reject for a pending user, revoke for an active one. */
  onReject: (user: AdminUser) => void;
  pending: { activate: boolean; reactivate: boolean; reject: boolean; revoke: boolean };
}

interface UserActionsProps extends UserActionHandlers {
  user: AdminUser;
  /** Each button fills its cell (the phone cards lay them out in equal columns). */
  fullWidth?: boolean;
}

/** Activate / Reject, Revoke or Reactivate for one account, depending on its status. The parent lays them out. */
export function UserActions({ user, meId, onActivate, onReactivate, onReject, pending, fullWidth }: UserActionsProps) {
  const fill = fullWidth ? 'w-full' : undefined;

  if (user.status === ACCOUNT_STATUS.ACTIVE) {
    if (user.id === meId) return null;
    return (
      <Button size="sm" variant="outline" className={fill} disabled={pending.revoke} onClick={() => onReject(user)}>
        Revoke
      </Button>
    );
  }

  if (user.status === ACCOUNT_STATUS.REJECTED) {
    return (
      <ApproveButton user={user} label="Reactivate" fullWidth={fullWidth} busy={pending.reactivate} onClick={onReactivate} />
    );
  }

  return (
    <>
      <ApproveButton user={user} label="Activate" fullWidth={fullWidth} busy={pending.activate} onClick={onActivate} />
      <Button size="sm" variant="outline" className={fill} disabled={pending.reject} onClick={() => onReject(user)}>
        Reject
      </Button>
    </>
  );
}

/** Activate or Reactivate: disabled, with a tooltip saying why, until the email address is verified. */
function ApproveButton({
  user,
  label,
  fullWidth,
  busy,
  onClick,
}: {
  user: AdminUser;
  label: string;
  fullWidth: boolean | undefined;
  busy: boolean;
  onClick: (user: AdminUser) => void;
}) {
  if (user.emailVerified) {
    return (
      <Button size="sm" className={cn(fullWidth && 'w-full')} disabled={busy} onClick={() => onClick(user)}>
        {label}
      </Button>
    );
  }
  return (
    <Tooltip>
      {/* A disabled button swallows pointer events, so the span carries the tooltip */}
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(fullWidth && 'flex w-full')}>
          <Button size="sm" className={cn(fullWidth && 'w-full')} disabled aria-label={`${label} ${user.name}`}>
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>This user has not verified their email address yet.</TooltipContent>
    </Tooltip>
  );
}
