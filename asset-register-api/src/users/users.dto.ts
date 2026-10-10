import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export const APP_ROLES = ['head_office', 'state_head', 'centre_head', 'asset_custodian', 'viewer'] as const;
export type AppRole = typeof APP_ROLES[number];

export class CreateUserDto {
  @IsString() @Length(1, 255) identitySubject!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 160) displayName!: string;
  @IsOptional() @IsString() @MaxLength(32) phoneNumber?: string;
  @IsIn(APP_ROLES) role!: AppRole;
  @IsOptional() @IsUUID() scopeLocationId?: string | null;
}

export class SetUserActiveDto {
  @IsBoolean() isActive!: boolean;
}
