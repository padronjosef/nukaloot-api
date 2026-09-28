import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard, type RequestWithAuth } from '../auth/bearer.guard';
import { LoginThrottle } from './login-throttle';
import { UnverifiedEmailError, UsersService } from './users.service';
import {
  GoogleSignInDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto';
import { MailService } from '../mail/mail.service';
import { verificationEmail } from '../mail/verification-email';
import { ROLE_PERMISSIONS } from '../entities';

@Controller('auth')
@UseGuards(BearerGuard)
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly throttle: LoginThrottle,
    private readonly mail: MailService,
  ) {}

  /** Checks a password. The session cookie itself is minted by the web app. */
  @Post('verify')
  async verify(@Body() body: LoginDto) {
    const key = body.email.trim().toLowerCase();

    const wait = this.throttle.retryAfter(key);
    if (wait > 0) {
      throw new HttpException(
        `Too many attempts. Try again in ${Math.ceil(wait / 60000)} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let user: Awaited<ReturnType<UsersService['verifyCredentials']>>;
    try {
      user = await this.users.verifyCredentials(body.email, body.password);
    } catch (error) {
      // The password was right, so this is not a failed attempt — it is an
      // account waiting on its link, and the web offers to send another.
      if (error instanceof UnverifiedEmailError) {
        this.throttle.succeed(key);
        throw new HttpException(
          { message: error.message, code: 'EMAIL_NOT_VERIFIED' },
          HttpStatus.FORBIDDEN,
        );
      }
      throw error;
    }

    if (!user) {
      this.throttle.fail(key);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.throttle.succeed(key);
    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }

  /**
   * Signing up by email. Always answers the same, whether the address was
   * free or already had an account: a different answer would let anyone
   * check who is registered here.
   */
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const key = `register:${body.email.trim().toLowerCase()}`;
    if (this.throttle.retryAfter(key) > 0) {
      throw new HttpException(
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.throttle.fail(key);

    const result = await this.users.register(body);
    if (!('alreadyExists' in result)) {
      await this.sendVerification(
        result.user.email,
        result.token,
        body.verifyUrl,
      );
    }

    return { sent: true };
  }

  /** Follows the link. */
  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    const user = await this.users.verifyEmail(body.token);
    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }

  /** A new link for someone who lost the first. Same answer either way. */
  @Post('resend-verification')
  async resendVerification(@Body() body: ResendVerificationDto) {
    const result = await this.users.refreshVerification(body.email);
    if (result) {
      await this.sendVerification(
        result.user.email,
        result.token,
        body.verifyUrl,
      );
    }

    return { sent: true };
  }

  private async sendVerification(
    email: string,
    token: string,
    verifyUrl: string,
  ): Promise<void> {
    const link = `${verifyUrl}${verifyUrl.includes('?') ? '&' : '?'}token=${token}`;
    await this.mail.send(verificationEmail(email, link));
  }

  /**
   * Called by the web once it has verified the code with Google. This service
   * never talks to Google itself and never sees the client secret.
   */
  @Post('google')
  async google(@Body() body: GoogleSignInDto) {
    const user = await this.users.findOrCreateFromGoogle(body);
    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }

  /** Lets the web re-check on each request that the account is still valid. */
  @Get('session/:id')
  async session(
    @Param('id') id: string,
    @Query('startedAt') startedAt?: string,
  ) {
    const user = await this.users.findById(id).catch(() => null);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Unknown or inactive user');
    }

    // `startedAt` is when the sign-in happened, and renewing a session never
    // moves it — so signing out kills the copies too, not just the cookie in
    // the browser that asked.
    const minted = Number(startedAt);
    if (
      !Number.isFinite(minted) ||
      !(await this.users.sessionIsValid(id, minted))
    ) {
      throw new UnauthorizedException('That session was signed out');
    }

    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }

  /** Signing out, for real: every session this account holds stops working. */
  @Post('revoke')
  @HttpCode(204)
  async revoke(@Req() req: RequestWithAuth) {
    if (req.auth?.sub) await this.users.revokeSessions(req.auth.sub);
  }

  /**
   * Editing your own account. The id is never sent by the browser — the web
   * reads it from the signed session cookie — so this cannot touch anyone else.
   */
  @Patch('profile/:id')
  async updateProfile(@Param('id') id: string, @Body() body: UpdateProfileDto) {
    const user = await this.users.updateProfile(id, body);
    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }
}
