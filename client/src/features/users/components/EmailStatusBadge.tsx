import { Badge } from '@/components/ui/badge';

/** "Verified" or "Not verified", in the users table and on the phone cards. */
export function EmailStatusBadge({ verified }: { verified: boolean }) {
  return verified ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline">Not verified</Badge>;
}
