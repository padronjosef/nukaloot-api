import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthController } from './auth.controller';
import { ActorGuard } from './actor.guard';
import { LoginThrottle } from './login-throttle';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule],
  controllers: [AuthController, UsersController],
  providers: [UsersService, ActorGuard, LoginThrottle],
  exports: [UsersService],
})
export class UsersModule {}
