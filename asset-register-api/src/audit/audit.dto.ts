import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class AuditEventsQueryDto {
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.-]{0,63}$/) eventType?: string;
}

export interface AuditEventDto {
  id:string;
  eventType:string;
  entityType:string;
  entityId:string;
  occurredAt:Date|string;
  actorName:string;
  locationName:string;
  details:Record<string,unknown>;
}

export interface AuditEventPageDto {
  items:AuditEventDto[];
  nextCursor:string|null;
}
