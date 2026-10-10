import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export const ASSET_STATUSES = ['active', 'unused', 'in_repair', 'out_of_service', 'missing', 'retired', 'disposed'] as const;
export const ASSET_CONDITIONS = ['good', 'fair', 'damaged', 'not_working'] as const;
export const ASSET_OWNERSHIP_TYPES = ['INCUSPAZE_OWNED','CLIENT_DEDICATED','VENDOR_LEASED','TRIAL_DEMO'] as const;

export class CreateAssetDto {
  @IsOptional() @IsUUID()
  clientRequestId?: string;
  @IsUUID()
  locationId!: string;

  @IsOptional() @IsIn(ASSET_OWNERSHIP_TYPES)
  ownershipType?: typeof ASSET_OWNERSHIP_TYPES[number];

  @IsOptional() @IsString() @Length(1, 40)
  assetTag?: string;

  @IsString() @Length(1, 160)
  name!: string;

  @IsString() @Length(1, 100)
  category!: string;

  @IsOptional() @IsString() @Length(1, 120)
  serialNumber?: string;

  @IsOptional() @IsString() @Length(1, 120)
  manufacturer?: string;

  @IsOptional() @IsString() @Length(1, 120)
  model?: string;

  @IsOptional() @IsIn(ASSET_CONDITIONS)
  condition?: typeof ASSET_CONDITIONS[number];

  @IsOptional() @IsDateString()
  purchaseDate?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(999999999999.99)
  purchaseAmount?: number;

  @IsOptional() @IsString() @Length(1, 3)
  currency?: string;

  @IsOptional() @IsString() @Length(1, 160)
  sellerName?: string;

  @IsOptional() @IsString() @Length(1, 40)
  sellerPhone?: string;

  @IsOptional() @IsString() @Length(1, 2000)
  notes?: string;
}

export class UpdateAssetDto {
  @IsOptional() @IsIn(ASSET_OWNERSHIP_TYPES)
  ownershipType?: typeof ASSET_OWNERSHIP_TYPES[number];

  @IsOptional() @IsIn(ASSET_STATUSES)
  status?: typeof ASSET_STATUSES[number];
  @IsOptional() @IsString() @Length(5, 500)
  statusChangeReason?: string;
  @IsOptional() @IsUUID()
  locationId?: string;
  @IsOptional() @IsString() @Length(1, 40)
  assetTag?: string;
  @IsOptional() @IsString() @Length(1, 160)
  name?: string;
  @IsOptional() @IsString() @Length(1, 100)
  category?: string;
  @IsOptional() @IsString() @Length(1, 120)
  serialNumber?: string;
  @IsOptional() @IsString() @Length(1, 120)
  manufacturer?: string;
  @IsOptional() @IsString() @Length(1, 120)
  model?: string;
  @IsOptional() @IsIn(ASSET_CONDITIONS)
  condition?: typeof ASSET_CONDITIONS[number];
  @IsOptional() @IsDateString()
  purchaseDate?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(999999999999.99)
  purchaseAmount?: number;
  @IsOptional() @IsString() @Length(1, 3)
  currency?: string;
  @IsOptional() @IsString() @Length(1, 160)
  sellerName?: string;
  @IsOptional() @IsString() @Length(1, 40)
  sellerPhone?: string;
  @IsOptional() @IsString() @Length(1, 2000)
  notes?: string;
}

export class ListAssetsDto {
  @IsOptional() @IsString() @Length(1, 120)
  q?: string;

  @IsOptional() @IsUUID()
  locationId?: string;

  @IsOptional() @IsIn(ASSET_STATUSES)
  status?: typeof ASSET_STATUSES[number];

  @IsOptional() @IsUUID()
  cursor?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(100)
  limit?: number;
}
