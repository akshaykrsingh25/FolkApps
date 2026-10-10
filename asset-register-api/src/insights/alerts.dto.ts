import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AlertsQueryDto {
  @IsOptional() @IsString() @MaxLength(512) cursor?:string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(200) limit?:number;
}
