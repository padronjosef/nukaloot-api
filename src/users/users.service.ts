import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Not, Repository } from 'typeorm';
import { User, USER_ROLES, UserRole } from '../entities';
import { hashPassword, verifyPassword } from './password';

export type PublicUser = Omit<User, 'passwordHash'>;

export type CreateUserInput = {
  email: string;
  password: string;
  name?: string | null;
  role?: UserRole;
};

export type UpdateUserInput = {
  name?: string | null;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
};

const MIN_PASSWORD_LENGTH = 10;

/** Right password, unconfirmed address — the caller offers to resend. */
export class UnverifiedEmailError extends Error {
  constructor(readonly email: string) {
    super('Confirm your email before signing in');
    this.name = 'UnverifiedEmailError';
  }
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  /**
   * Without this the panel would be unreachable on a fresh database. It only
   * ever fires when there is no user at all, so it cannot overwrite anything.
   */
  async onModuleInit(): Promise<void> {
    await this.backfillVerified();

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;

    const existing = await this.repo.count();
    if (existing > 0) return;

    await this.repo.save(
      this.repo.create({
        email,
        name: 'Owner',
        passwordHash: await hashPassword(password),
        role: 'admin',
        isActive: true,
        emailVerified: true,
      }),
    );
    this.logger.log(`Bootstrapped the first admin user: ${email}`);
  }

  /**
   * Accounts that predate email confirmation were created by an admin or by
   * the bootstrap, and adding the column left them all reading "unverified" —
   * which would have locked them out. Only an account that actually went
   * through sign-up holds a verification token, so anything without one is
   * already trusted. Idempotent: after the first boot it matches nothing.
   */
  private async backfillVerified(): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({ emailVerified: true })
      .where('"emailVerified" = false')
      .andWhere('"verificationTokenHash" IS NULL')
      .execute();

    if (result.affected) {
      this.logger.log(
        `Marked ${result.affected} pre-existing accounts as verified`,
      );
    }
  }

  async findAll(): Promise<PublicUser[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Returns the user only when the password matches and the account is active. */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<PublicUser | null> {
    const normalized = email.trim().toLowerCase();
    const user = await this.repo.findOne({
      where: { email: normalized },
      select: [
        'id',
        'email',
        'name',
        'role',
        'isActive',
        'passwordHash',
        'emailVerified',
      ],
    });

    if (!user || !user.isActive) return null;
    // No hash means the account only signs in through a provider.
    if (!user.passwordHash) return null;
    if (!(await verifyPassword(password, user.passwordHash))) return null;

    // Checked after the password on purpose: answering "confirm your email"
    // before knowing the password would confirm the address exists.
    if (!user.emailVerified) throw new UnverifiedEmailError(user.email);

    await this.repo.update(user.id, { lastLoginAt: new Date() });
    return this.findById(user.id);
  }

  /**
   * Signing in with Google. Matched on the Google id first and the email
   * second, so an account that already exists here is linked rather than
   * duplicated — that is how an admin keeps their role when they switch to
   * Google. A brand new account gets `user`, which grants nothing.
   */
  async findOrCreateFromGoogle(input: {
    googleId: string;
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
  }): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();

    const existing =
      (await this.repo.findOne({ where: { googleId: input.googleId } })) ??
      (await this.repo.findOne({ where: { email } }));

    if (existing) {
      if (!existing.isActive) {
        throw new ForbiddenException('This account is blocked');
      }

      await this.repo.update(existing.id, {
        googleId: input.googleId,
        lastLoginAt: new Date(),
        // Signing in through Google proves the address, so it also rescues an
        // account that signed up by email and never confirmed.
        emailVerified: true,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        // Only ever fills gaps: a name set here is not overwritten by Google.
        ...(existing.name ? {} : { name: input.name?.trim() || null }),
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      });

      return this.findById(existing.id);
    }

    const created = await this.repo.save(
      this.repo.create({
        email,
        name: input.name?.trim() || null,
        googleId: input.googleId,
        avatarUrl: input.avatarUrl ?? null,
        passwordHash: null,
        role: 'user',
        isActive: true,
        emailVerified: true,
        lastLoginAt: new Date(),
      }),
    );

    return this.findById(created.id);
  }

  /**
   * Signing up by email. The account exists but cannot sign in until the link
   * is followed, and an unconfirmed one is swept away later, so an address
   * somebody does not own never turns into a usable account.
   */
  async register(input: {
    email: string;
    password: string;
    name?: string | null;
  }): Promise<{ user: PublicUser; token: string } | { alreadyExists: true }> {
    const email = input.email.trim().toLowerCase();
    this.assertEmail(email);
    this.assertPassword(input.password);

    const existing = await this.repo.findOne({ where: { email } });
    if (existing) {
      // Deliberately not an error: saying "that address is taken" tells a
      // stranger who has an account here. The caller answers the same either
      // way, and the person who owns it gets nothing new.
      return { alreadyExists: true };
    }

    const { token, hash, expiresAt } = this.newVerificationToken();

    const user = await this.repo.save(
      this.repo.create({
        email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
        role: 'user',
        isActive: true,
        emailVerified: false,
        verificationTokenHash: hash,
        verificationExpiresAt: expiresAt,
        verificationSentAt: new Date(),
      }),
    );

    return { user: await this.findById(user.id), token };
  }

  /** Turns a link's token into a verified account. */
  async verifyEmail(token: string): Promise<PublicUser> {
    const hash = this.hashToken(token);
    const user = await this.repo.findOne({
      where: { verificationTokenHash: hash },
      select: ['id', 'verificationExpiresAt', 'emailVerified'],
    });

    if (!user) throw new BadRequestException('That link is not valid');

    if (
      user.verificationExpiresAt &&
      user.verificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('That link expired — ask for a new one');
    }

    await this.repo.update(user.id, {
      emailVerified: true,
      verificationTokenHash: null,
      verificationExpiresAt: null,
    });

    return this.findById(user.id);
  }

  /**
   * A fresh link for someone who lost the first. Returns null when there is
   * nothing to send, so the caller can answer identically either way.
   */
  async refreshVerification(
    email: string,
  ): Promise<{ user: PublicUser; token: string } | null> {
    const user = await this.repo.findOne({
      where: { email: email.trim().toLowerCase() },
      select: ['id', 'emailVerified', 'verificationSentAt'],
    });

    if (!user || user.emailVerified) return null;

    // One a minute is plenty, and stops this being a way to flood an inbox.
    const last = user.verificationSentAt?.getTime() ?? 0;
    if (Date.now() - last < 60_000) return null;

    const { token, hash, expiresAt } = this.newVerificationToken();
    await this.repo.update(user.id, {
      verificationTokenHash: hash,
      verificationExpiresAt: expiresAt,
      verificationSentAt: new Date(),
    });

    return { user: await this.findById(user.id), token };
  }

  /** Accounts nobody ever confirmed. They cannot sign in, so they are litter. */
  async removeUnverified(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('"emailVerified" = false')
      .andWhere('"googleId" IS NULL')
      .andWhere('role = :role', { role: 'user' })
      .andWhere('"createdAt" < :cutoff', { cutoff })
      .execute();

    return result.affected ?? 0;
  }

  private newVerificationToken() {
    const token = randomBytes(32).toString('hex');
    return {
      token,
      hash: this.hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();
    this.assertEmail(email);
    this.assertPassword(input.password);
    this.assertRole(input.role);

    if (await this.repo.findOne({ where: { email } })) {
      throw new ConflictException('That email is already registered');
    }

    const user = await this.repo.save(
      this.repo.create({
        email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
        // Fails closed: an omitted role grants nothing.
        role: input.role ?? 'user',
        isActive: true,
        // An admin adding somebody vouches for the address themselves.
        emailVerified: true,
      }),
    );

    return this.findById(user.id);
  }

  async update(id: string, input: UpdateUserInput): Promise<PublicUser> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (input.role !== undefined) this.assertRole(input.role);
    if (input.password !== undefined) this.assertPassword(input.password);

    const losingAdmin =
      (input.role !== undefined && input.role !== 'admin') ||
      input.isActive === false;
    if (user.role === 'admin' && losingAdmin) {
      await this.assertNotLastAdmin(user.id);
    }

    await this.repo.update(id, {
      ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined
        ? { passwordHash: await hashPassword(input.password) }
        : {}),
    });

    return this.findById(id);
  }

  /**
   * What someone may change about themselves: their name and their password,
   * never their role or whether they are active.
   */
  async updateProfile(
    id: string,
    input: {
      name?: string | null;
      currentPassword?: string;
      newPassword?: string;
    },
  ): Promise<PublicUser> {
    const user = await this.repo.findOne({
      where: { id },
      select: ['id', 'passwordHash'],
    });
    if (!user) throw new NotFoundException('User not found');

    let passwordHash: string | undefined;
    if (input.newPassword) {
      this.assertPassword(input.newPassword);

      // An account that has a password must prove it still knows it. One that
      // only signs in through a provider is setting its first password.
      if (user.passwordHash) {
        const matches =
          !!input.currentPassword &&
          (await verifyPassword(input.currentPassword, user.passwordHash));
        if (!matches) {
          throw new BadRequestException('Your current password is not right');
        }
      }

      passwordHash = await hashPassword(input.newPassword);
    }

    await this.repo.update(id, {
      ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    });

    return this.findById(id);
  }

  /** Signing out. Every session already handed to this account stops working. */
  async revokeSessions(id: string): Promise<void> {
    // Rounded up to the next whole second. Sessions carry their start time in
    // seconds, so stamping the current instant would let one that began in
    // this very second survive the sign-out — failing open.
    const nextSecond = (Math.floor(Date.now() / 1000) + 1) * 1000;
    await this.repo.update(id, { sessionsValidFrom: new Date(nextSecond) });
  }

  /**
   * Whether a sign-in that began at `startedAt` is still good. Kept here
   * rather than in the web app so the rule lives with the data it protects.
   */
  async sessionIsValid(id: string, startedAt: number): Promise<boolean> {
    const user = await this.repo.findOne({
      where: { id },
      select: ['id', 'sessionsValidFrom'],
    });
    if (!user) return false;
    if (!user.sessionsValidFrom) return true;

    // Seconds, because that is the resolution the token carries.
    return startedAt >= Math.floor(user.sessionsValidFrom.getTime() / 1000);
  }

  async remove(id: string): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'admin') await this.assertNotLastAdmin(user.id);
    await this.repo.delete(id);
  }

  private async assertNotLastAdmin(excludingId: string): Promise<void> {
    const remaining = await this.repo.count({
      where: { role: 'admin', isActive: true, id: Not(excludingId) },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'This is the last active admin — promote someone else first',
      );
    }
  }

  private assertEmail(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }
  }

  private assertPassword(password: string): void {
    // Counted after trimming: ten spaces clears a plain length check while
    // being no secret at all, and so does a short word padded out with them.
    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  private assertRole(role?: UserRole): void {
    if (role !== undefined && !USER_ROLES.includes(role)) {
      throw new BadRequestException(
        `Role must be one of: ${USER_ROLES.join(', ')}`,
      );
    }
  }
}
