import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreatePolicyDto {
  @IsUUID() scopeLocationId!: string;
  @IsInt() @Min(1) @Max(24) cadenceMonths!: number;
  @IsInt() @Min(0) @Max(180) graceDays!: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) escalationIntervalDays?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdatePolicyDto {
  @IsOptional() @IsInt() @Min(1) @Max(24) cadenceMonths?: number;
  @IsOptional() @IsInt() @Min(0) @Max(180) graceDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) escalationIntervalDays?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateCycleDto {
  @IsUUID() policyId!: string;
  @IsOptional() @IsDateString() startsAt?: string;
}

export class CloseCycleDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class RecordScanDto {
  @IsUUID() assetId!: string;
  @IsUUID() locationId!: string;
  @IsUUID() clientEventId!: string;
  @IsDateString() scannedAt!: string;
  @IsOptional() @IsIn(['qr','barcode','rfid','manual']) identificationMethod?: 'qr'|'barcode'|'rfid'|'manual';
  @IsOptional() latitude?: number;
  @IsOptional() longitude?: number;
}

export class RfidScanReadingDto {
  @IsString() @Matches(/^(?:[A-Fa-f0-9]{2}){4,32}$/)
  epc!: string;

  @IsUUID() clientEventId!: string;

  @IsDateString() scannedAt!: string;
}

export class RecordRfidScansDto {
  @IsUUID() locationId!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => RfidScanReadingDto)
  readings!: RfidScanReadingDto[];
}
