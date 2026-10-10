import { IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreatePolicyDto {
  @IsUUID() scopeLocationId!: string;
  @IsInt() @Min(1) @Max(24) cadenceMonths!: number;
  @IsInt() @Min(0) @Max(180) graceDays!: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateCycleDto {
  @IsUUID() policyId!: string;
  @IsOptional() @IsDateString() startsAt?: string;
}

export class RecordScanDto {
  @IsUUID() assetId!: string;
  @IsUUID() locationId!: string;
  @IsUUID() clientEventId!: string;
  @IsDateString() scannedAt!: string;
  @IsOptional() latitude?: number;
  @IsOptional() longitude?: number;
}
