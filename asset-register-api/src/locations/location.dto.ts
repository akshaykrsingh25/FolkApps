import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export const LOCATION_KINDS = ['state', 'centre', 'warehouse', 'building', 'floor', 'area'] as const;
export type LocationKind = typeof LOCATION_KINDS[number];

export class CreateLocationDto {
  @IsIn(LOCATION_KINDS)
  kind!: LocationKind;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional() @IsUUID()
  parentId?: string;

  @IsOptional() @IsString() @Length(1, 40)
  code?: string;

  @IsOptional() @IsString() @Length(1, 80)
  city?: string;

  @IsOptional() @IsString() @Length(1, 80)
  stateName?: string;

  @IsOptional() @IsNumber() @Min(6.5) @Max(37.5)
  latitude?: number;

  @IsOptional() @IsNumber() @Min(68) @Max(98)
  longitude?: number;
}

export class ListLocationsDto {
  @IsOptional() @IsUUID()
  parentId?: string;

  @IsOptional() @IsIn(LOCATION_KINDS)
  kind?: LocationKind;

  @IsOptional() @IsString() @Length(1, 100)
  q?: string;
}

export class PatchCoordinatesDto {
  @IsNumber() @Min(6.5) @Max(37.5) latitude!: number;
  @IsNumber() @Min(68) @Max(98) longitude!: number;
}

export class CentreCsvDto {
  @IsString() @Length(1, 1_000_000)
  csv!: string;
}
