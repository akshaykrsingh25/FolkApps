import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsUUID() assetId!: string;
  @IsIn(['damaged','needs_repair','not_working','other']) kind!: string;
  @IsIn(['normal','high','urgent']) urgency!: string;
  @IsString() @Length(5,2000) description!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID(undefined,{each:true}) evidenceIds?: string[];
}
export class UpdateReportDto {
  @IsIn(['reported','assigned','in_repair','resolved','closed']) status!: string;
  @IsOptional() @IsUUID() assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(2000) resolutionNotes?: string;
}
export class CreateTransferDto {
  @IsUUID() assetId!: string;
  @IsUUID() toLocationId!: string;
  @IsOptional() @IsString() @MaxLength(2000) handoverNotes?: string;
}
export class TransferActionDto {
  @IsIn(['approve','dispatch','receive','reject','cancel']) action!: string;
  @IsOptional() @IsString() @MaxLength(2000) handoverNotes?: string;
}
export class CreateWarrantyDto {
  @IsIn(['warranty','guarantee','amc','other']) coverageKind!: string;
  @IsOptional() @IsString() @MaxLength(160) provider?: string;
  @IsOptional() @IsString() @MaxLength(40) servicePhone?: string;
  @IsOptional() @IsDateString() startsOn?: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsString() @MaxLength(2000) terms?: string;
}
