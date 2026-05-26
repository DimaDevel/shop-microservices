import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────
//  DTOs with class-validator
// ValidationPipe automatically validates incoming requests.
// If a field fails validation — 400 Bad Request with details.
// ─────────────────────────────────────────────────────────────

export class LoginDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}

export class RegisterDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password too long' })
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
