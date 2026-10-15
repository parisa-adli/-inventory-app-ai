import type { DeviceSession } from '@inventory/shared';
import { RefreshToken } from '../models/RefreshToken.js';
import { sha256 } from '../utils/crypto.js';

// A user's Sessions (CONTEXT.md) as the Profile page lists them. Every live refresh token belongs to one
// family (one browser); rotation revokes the previous token, so a family normally has one live token.

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari", Android also says "Linux".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

const firstMatch = (value: string, table: [RegExp, string][]) => table.find(([pattern]) => pattern.test(value))?.[1];

/** "Chrome on Windows" from a User-Agent header; no dependency, the common browsers only. */
export const describeUserAgent = (userAgent: string | null | undefined): string => {
  if (!userAgent) return 'Unknown device';
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
};

/** Live sessions only; the one holding `rawRefreshToken` first, then the most recently active. */
export const listDeviceSessions = async (userId: string, rawRefreshToken: string | undefined): Promise<DeviceSession[]> => {
  const tokens = await RefreshToken.find({ user: userId, revoked: false, expiresAt: { $gt: new Date() } }).lean();
  const currentHash = rawRefreshToken ? sha256(rawRefreshToken) : undefined;

  const families = new Map<string, DeviceSession>();
  for (const token of tokens) {
    // Tokens from before families existed are a session of their own
    const id = token.familyId ?? String(token._id);
    const lastActiveAt = (token.lastUsedAt ?? token.createdAt).toISOString();
    const current = token.tokenHash === currentHash;
    const seen = families.get(id);
    if (seen && seen.lastActiveAt >= lastActiveAt) {
      seen.current ||= current;
      continue;
    }
    families.set(id, {
      id,
      device: describeUserAgent(token.userAgent),
      ip: token.ip ?? null,
      signedInAt: (token.familyCreatedAt ?? token.createdAt).toISOString(),
      lastActiveAt,
      current: current || Boolean(seen?.current),
    });
  }

  return [...families.values()].sort(
    (a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt)
  );
};
