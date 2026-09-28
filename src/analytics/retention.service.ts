import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchLog } from '../entities';
import { UsersService } from '../users/users.service';

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_UNVERIFIED_DAYS = 7;
/** 0 is Sunday. Quietest hour of the quietest day, in UTC. */
const DEFAULT_SWEEP_DAY = 0;
const DEFAULT_SWEEP_HOUR = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Erases the IP from old searches and nothing else. The row itself is kept
 * for good: the point of this table is watching the project grow over years,
 * and every figure the panel shows survives without the address.
 *
 * The sweep runs once a week, so an address outlives its retention window by
 * up to seven days — a 7 day setting clears addresses aged 7 to 14 days.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @InjectRepository(SearchLog)
    private readonly repo: Repository<SearchLog>,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Waits for the configured weekday rather than counting from boot, so a
   * restart cannot drag the sweep to an arbitrary day.
   */
  private scheduleNext(): void {
    const wait = this.msUntilNextRun();
    this.logger.log(
      `Next IP sweep in ${Math.round(wait / 3_600_000)}h ` +
        `(clearing addresses older than ${this.retentionDays} days)`,
    );

    this.timer = setTimeout(() => {
      void Promise.allSettled([this.sweep(), this.sweepUnverified()]).finally(
        () => this.scheduleNext(),
      );
    }, wait);
    // Without this the timer keeps the process alive on shutdown.
    this.timer.unref?.();
  }

  private msUntilNextRun(): number {
    const day = this.envNumber('SEARCH_LOG_SWEEP_DAY', DEFAULT_SWEEP_DAY, 0, 6);
    const hour = this.envNumber(
      'SEARCH_LOG_SWEEP_HOUR',
      DEFAULT_SWEEP_HOUR,
      0,
      23,
    );

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + ((day - next.getUTCDay() + 7) % 7));

    const wait = next.getTime() - now.getTime();
    return wait > 0 ? wait : wait + WEEK_MS;
  }

  private envNumber(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = Number(process.env[name]);
    return Number.isInteger(raw) && raw >= min && raw <= max ? raw : fallback;
  }

  get retentionDays(): number {
    const raw = Number(process.env.SEARCH_LOG_IP_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_DAYS;
  }

  /**
   * Removes accounts that signed up by email and never followed the link.
   * They cannot sign in, so they are litter — and leaving them would let
   * anyone squat an address they do not own.
   */
  async sweepUnverified(): Promise<number> {
    const days = this.unverifiedDays;

    try {
      const removed = await this.users.removeUnverified(days);
      if (removed > 0) {
        this.logger.log(
          `Removed ${removed} accounts unconfirmed for over ${days} days`,
        );
      }
      return removed;
    } catch (err) {
      this.logger.warn(`Unverified account sweep failed: ${String(err)}`);
      return 0;
    }
  }

  get unverifiedDays(): number {
    const raw = Number(process.env.UNVERIFIED_ACCOUNT_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UNVERIFIED_DAYS;
  }

  /** Best effort: a failed sweep must never take the API down with it. */
  async sweep(): Promise<number> {
    const days = this.retentionDays;

    try {
      const result = await this.repo
        .createQueryBuilder()
        .update(SearchLog)
        .set({ ip: null })
        .where('ip IS NOT NULL')
        .andWhere(`"createdAt" < now() - interval '${days} days'`)
        .execute();

      const cleared = result.affected ?? 0;
      if (cleared > 0) {
        this.logger.log(
          `Cleared the IP from ${cleared} searches older than ${days} days`,
        );
      }
      return cleared;
    } catch (err) {
      this.logger.warn(`IP retention sweep failed: ${String(err)}`);
      return 0;
    }
  }
}
