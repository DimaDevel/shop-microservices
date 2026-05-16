import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────
//  DTO с class-validator
//  ValidationPipe автоматически валидирует входящие запросы.
//  Если поле не проходит валидацию — 400 Bad Request с деталями.
// ─────────────────────────────────────────────────────────────

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}

export class RegisterDto {
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

export class TokensResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
