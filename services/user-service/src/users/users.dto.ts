import { IsString, IsOptional, IsUrl, MaxLength, IsEmail, IsUUID } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

export class CreateProfileDto {
  @IsUUID()
  id: string;

  @IsEmail()
  email: string;
}
