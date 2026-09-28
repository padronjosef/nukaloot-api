import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, type UserRole } from '../entities';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: UserRole;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  /** Where the confirmation link should point, supplied by the web app. */
  @IsString()
  @MinLength(1)
  verifyUrl: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  verifyUrl: string;
}

export class GoogleSignInDto {
  @IsString()
  @MinLength(1)
  googleId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  newPassword?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;
}
