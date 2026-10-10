import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const EXPORT_ASSET_STATUSES = ['active', 'unused', 'in_repair', 'out_of_service', 'missing', 'retired', 'disposed'] as const;

export class CreateAssetExportDto {
  @IsUUID()
  clientRequestId!: string;

  @IsOptional() @IsUUID()
  scopeLocationId?: string;

  @IsOptional() @IsIn(EXPORT_ASSET_STATUSES)
  status?: typeof EXPORT_ASSET_STATUSES[number];

  @IsOptional() @IsString() @Length(1, 120)
  search?: string;
}
