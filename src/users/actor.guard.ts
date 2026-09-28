import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '../entities';
import type { RequestWithAuth } from '../auth/bearer.guard';
import { UsersService, type PublicUser } from './users.service';
import { PERMISSION_KEY } from './require-permission.decorator';

export type RequestWithActor = RequestWithAuth & { actor?: PublicUser };

/**
 * Who the call acts for comes from the verified token, never from a header,
 * so holding the token is not enough to act as somebody else. The role is
 * then read from the stored user — never from a claim the caller supplied.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithActor>();
    const actorId = req.auth?.sub;

    if (!actorId) throw new UnauthorizedException('Token carries no actor');

    const actor = await this.users.findById(actorId).catch(() => null);
    if (!actor || !actor.isActive) {
      throw new UnauthorizedException('Unknown or inactive actor');
    }

    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required && !hasPermission(actor.role, required)) {
      throw new ForbiddenException(`Requires ${required}`);
    }

    req.actor = actor;
    return true;
  }
}
