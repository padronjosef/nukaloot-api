import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyApiToken, type ApiTokenClaims } from './api-token';

export type RequestWithAuth = Request & { auth?: ApiTokenClaims };

/**
 * Every call that is not public data has to carry a signed, short-lived
 * bearer token. The API checks it itself, so it never depends on the network
 * being private — that is a second wall, not the only one.
 */
@Injectable()
export class BearerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const header = req.header('authorization') ?? '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = verifyApiToken(header.slice(7).trim());
    if (!claims) throw new UnauthorizedException('Invalid or expired token');

    req.auth = claims;
    return true;
  }
}
