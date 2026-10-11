import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class TicketDto {
 @IsUUID() id!:string; @IsUUID() assetId!:string;
 @IsString() @MinLength(1) @MaxLength(160) vendor!:string;
 @IsString() @MinLength(1) @MaxLength(160) contractReference!:string;
 @IsString() @MinLength(1) @MaxLength(2000) description!:string;
 @IsInt() @Min(1) @Max(8760) ackHours!:number;
 @IsInt() @Min(1) @Max(8760) resolutionHours!:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(1000000) creditPerHour!:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(10000000) creditCap!:number;
}
export class TicketActionDto { @IsIn(['acknowledged','resolved']) status!:'acknowledged'|'resolved'; }
export class CreditDto { @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(10000000) amount!:number; @IsString() @MinLength(5) @MaxLength(2000) reason!:string; }
export class RoomDto {
 @IsUUID() locationId!:string;
 @IsNumber() @Min(0) @Max(100) x!:number; @IsNumber() @Min(0) @Max(100) y!:number;
 @IsNumber() @Min(1) @Max(100) width!:number; @IsNumber() @Min(1) @Max(100) height!:number;
}
export class PlanDto {
 @IsUUID() id!:string; @IsUUID() floorId!:string;
 @IsString() @MinLength(1) @MaxLength(160) name!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>RoomDto) rooms!:RoomDto[];
}
export class PlanQueryDto { @IsUUID() floorId!:string; @IsUUID() @IsOptional() cycleId?:string; }
export class DepreciationDto {
 @IsUUID() id!:string; @IsDateString() periodEnd!:string;
 @IsString() @MinLength(1) @MaxLength(200) policyReference!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('4',{each:true}) assetIds!:string[];
 @IsInt() @Min(1) @Max(600) usefulLifeMonths!:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) residualPercent!:number;
}
export class FinanceActionDto {
 @IsIn(['approved','exported','reconciled']) status!:'approved'|'exported'|'reconciled';
 @IsString() @MaxLength(200) @IsOptional() externalReference?:string;
}
