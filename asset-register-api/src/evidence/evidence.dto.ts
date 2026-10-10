import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, Matches } from 'class-validator';

export const EVIDENCE_KINDS = ['asset_photo', 'invoice', 'label', 'condition_photo', 'handover', 'other'] as const;
export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export class CreateEvidenceUploadDto {
  @IsUUID()
  clientEvidenceId!: string;

  @IsIn(EVIDENCE_KINDS)
  kind!: typeof EVIDENCE_KINDS[number];

  @IsString() @Length(1, 200)
  originalName!: string;

  @IsIn(EVIDENCE_TYPES)
  contentType!: typeof EVIDENCE_TYPES[number];

  @IsInt() @Min(1) @Max(20 * 1024 * 1024)
  byteSize!: number;

  @IsString() @Matches(/^[0-9a-f]{64}$/i)
  sha256!: string;
}

export class CompleteEvidenceUploadDto {
  @IsUUID()
  evidenceId!: string;
}
