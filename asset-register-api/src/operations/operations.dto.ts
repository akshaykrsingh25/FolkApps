import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class AssignCompletionDto {
 @IsUUID() assetId!:string;
 @IsUUID() assignedTo!:string;
 @IsDateString() dueAt!:string;
 @IsString() @MaxLength(2000) @IsOptional() notes?:string;
}
export class TaskActionDto { @IsIn(['completed','cancelled']) status!:'completed'|'cancelled'; }
export class ReuseQueryDto {
 @IsString() @MinLength(1) @MaxLength(120) category!:string;
 @IsString() @MaxLength(120) @IsOptional() q?:string;
}
