import { Injectable } from '@nestjs/common';

const MAX_ATTEMPTS = 5;
/** How long misses accumulate before the count starts over. */
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;

type Attempts = { count: number; first: number; blockedUntil: number | null };

/**
 * Rate limits password sign-ins. Counted per email rather than per IP: an
 * attacker rotates addresses freely, and locking by IP would shut out everyone
 * behind the same office or mobile network.
 *
 * In memory on purpose — one small API process. With more than one replica
 * this would have to move to the database or Redis to be worth anything.
 */
@Injectable()
export class LoginThrottle {
  private readonly attempts = new Map<string, Attempts>();
  private lastSweep = Date.now();

  /** Milliseconds left on the lockout, or 0 when the attempt may proceed. */
  retryAfter(key: string): number {
    this.sweep();
    const entry = this.attempts.get(key);
    if (!entry?.blockedUntil) return 0;

    const remaining = entry.blockedUntil - Date.now();
    if (remaining > 0) return remaining;

    this.attempts.delete(key);
    return 0;
  }

  fail(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);

    // A fresh window: old misses should not add up forever.
    if (!entry || now - entry.first > WINDOW_MS) {
      this.attempts.set(key, { count: 1, first: now, blockedUntil: null });
      return;
    }

    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) entry.blockedUntil = now + LOCKOUT_MS;
  }

  /** Signing in correctly clears the slate. */
  succeed(key: string): void {
    this.attempts.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_MS) return;
    this.lastSweep = now;

    for (const [key, entry] of this.attempts) {
      const stale = now - entry.first > WINDOW_MS;
      const unblocked = !entry.blockedUntil || entry.blockedUntil < now;
      if (stale && unblocked) this.attempts.delete(key);
    }
  }
}
