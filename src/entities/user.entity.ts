import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export const USER_ROLES = ['admin', 'operator', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = ['VIEW_ANALYTICS', 'MANAGE_ACCESS'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The role is the gate: nothing is granted outside this map. `user` is what
 * anyone who signs up gets — it opens their own profile and price alarms and
 * nothing else, so a new sign-in can never land inside the admin panel.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['VIEW_ANALYTICS', 'MANAGE_ACCESS'],
  operator: ['VIEW_ANALYTICS'],
  user: [],
};

export const hasPermission = (
  role: UserRole,
  permission: Permission,
): boolean => ROLE_PERMISSIONS[role]?.includes(permission) ?? false;

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ nullable: true, type: 'varchar' })
  name: string | null;

  /** Null for an account that only ever signs in through a provider. */
  @Column({ select: false, nullable: true, type: 'varchar' })
  passwordHash: string | null;

  /**
   * Google's stable subject id. Matched on before the email, so someone who
   * changes their Google address keeps the same account.
   */
  @Index({ unique: true })
  @Column({ nullable: true, type: 'varchar' })
  googleId: string | null;

  /** Their Google picture, shown in the header once they sign in that way. */
  @Column({ nullable: true, type: 'varchar' })
  avatarUrl: string | null;

  /**
   * Signing up by email starts unverified and cannot sign in until the link
   * is followed. Google accounts arrive verified — Google already proved it.
   */
  @Column({ default: false })
  emailVerified: boolean;

  /**
   * The hash of the link's token, never the token itself: whoever reads this
   * table must not be able to claim somebody's account with it.
   */
  @Column({ select: false, nullable: true, type: 'varchar' })
  verificationTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verificationExpiresAt: Date | null;

  /** Used to space out resends. */
  @Column({ type: 'timestamptz', nullable: true })
  verificationSentAt: Date | null;

  /**
   * Sessions issued before this instant are refused. Signing out sets it to
   * now, which is what makes signing out mean something on the server — a
   * stolen cookie stops working rather than lasting until it expires.
   */
  @Column({ type: 'timestamptz', nullable: true })
  sessionsValidFrom: Date | null;

  /**
   * Which machines this person actually owns, and so which prices they may be
   * shown for a game they are watching. Null means never chosen, which reads
   * as PC. A per-game override lives on the favourite itself.
   */
  @Column({ type: 'simple-array', nullable: true })
  trackedPlatforms: string[] | null;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
