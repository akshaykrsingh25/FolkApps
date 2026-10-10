import { BadRequestException, Injectable } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { DatabaseService } from '../database.service';
import type { AuditEventDto, AuditEventPageDto, AuditEventsQueryDto } from './audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly database:DatabaseService) {}

  async list(actor:ActorContext,dto:AuditEventsQueryDto):Promise<AuditEventPageDto> {
    const cursor=dto.cursor?this.decodeCursor(dto.cursor):null;
    const rows=await this.database.query<AuditEventDto>(
      `WITH RECURSIVE assigned_locations(id) AS (
         SELECT scope_location_id FROM role_assignments
          WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
         UNION
         SELECT child.id FROM locations child JOIN assigned_locations parent ON child.parent_id=parent.id
          WHERE child.organization_id=$1::uuid
       ), visible_locations(id) AS (
         SELECT id FROM assigned_locations
         UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS (
           SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid
             AND role_key='head_office' AND scope_location_id IS NULL
         )
       ), selected_tree(id) AS (
         SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$3::uuid
         UNION SELECT child.id FROM locations child JOIN selected_tree parent ON child.parent_id=parent.id
          WHERE child.organization_id=$1::uuid
       ), readable_locations(id) AS (
         SELECT id FROM visible_locations WHERE $3::uuid IS NULL
         UNION SELECT id FROM selected_tree WHERE id IN (SELECT id FROM visible_locations)
       ), event_places(event_id,location_id) AS (
         SELECT e.id,a.location_id FROM audit_events e JOIN assets a
           ON e.entity_type='asset' AND a.organization_id=e.organization_id AND a.id=e.entity_id
         UNION
         SELECT e.id,a.location_id FROM audit_events e JOIN condition_reports r
           ON e.entity_type='condition_report' AND r.organization_id=e.organization_id AND r.id=e.entity_id
         JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id
         UNION
         SELECT e.id,a.location_id FROM audit_events e JOIN transfer_requests t
           ON e.entity_type='transfer' AND t.organization_id=e.organization_id AND t.id=e.entity_id
         JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id
         UNION
         SELECT e.id,b.from_location_id FROM audit_events e JOIN transfer_batches b
           ON e.entity_type='transfer_batch' AND b.organization_id=e.organization_id AND b.id=e.entity_id
         UNION
         SELECT e.id,b.to_location_id FROM audit_events e JOIN transfer_batches b
           ON e.entity_type='transfer_batch' AND b.organization_id=e.organization_id AND b.id=e.entity_id
         UNION
         SELECT e.id,a.location_id FROM audit_events e JOIN transfer_batch_items i
           ON e.entity_type='transfer_batch' AND i.organization_id=e.organization_id AND i.batch_id=e.entity_id
         JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
         UNION
         SELECT e.id,c.scope_location_id FROM audit_events e JOIN verification_cycles c
           ON e.entity_type='verification_cycle' AND c.organization_id=e.organization_id AND c.id=e.entity_id
         UNION
         SELECT e.id,p.scope_location_id FROM audit_events e JOIN verification_policies p
           ON e.entity_type='verification_policy' AND p.organization_id=e.organization_id AND p.id=e.entity_id
         UNION
         SELECT e.id,e.entity_id FROM audit_events e JOIN locations l
           ON e.entity_type='location' AND l.organization_id=e.organization_id AND l.id=e.entity_id
       ), scoped_events AS (
         SELECT DISTINCT ON (e.id) e.id,e.event_type AS "eventType",e.entity_type AS "entityType",
                e.entity_id AS "entityId",e.occurred_at AS "occurredAt",
                COALESCE(u.display_name,'System') AS "actorName",l.name AS "locationName",
                CASE WHEN e.event_type IN ('transfer.requested','transfer_batch.requested')
                     THEN e.details-'from'-'to'-'fromLocationId'-'toLocationId' ELSE e.details END AS details
           FROM audit_events e JOIN event_places place ON place.event_id=e.id
           JOIN locations l ON l.organization_id=e.organization_id AND l.id=place.location_id
           LEFT JOIN users u ON u.organization_id=e.organization_id AND u.id=e.actor_user_id
          WHERE e.organization_id=$1::uuid AND place.location_id IN (SELECT id FROM readable_locations)
            AND ($4::text IS NULL OR e.event_type=$4)
            AND ($5::timestamptz IS NULL OR (e.occurred_at,e.id)<($5::timestamptz,$6::uuid))
          ORDER BY e.id,place.location_id
       )
       SELECT * FROM scoped_events ORDER BY "occurredAt" DESC,id DESC LIMIT $7`,
      [actor.organizationId,actor.userId,dto.locationId??null,dto.eventType??null,cursor?.occurredAt??null,cursor?.id??null,(dto.limit??50)+1],
    );
    const hasMore=rows.length>(dto.limit??50);
    const items=hasMore?rows.slice(0,dto.limit??50):rows;
    return {items,nextCursor:hasMore?this.encodeCursor(items[items.length-1]):null};
  }

  private encodeCursor(item:{occurredAt:string|Date;id:string}) {
    return Buffer.from(JSON.stringify([new Date(item.occurredAt).toISOString(),item.id]),'utf8').toString('base64url');
  }

  private decodeCursor(cursor:string) {
    try {
      if(cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor format');
      const value:unknown=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
      if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||typeof value[1]!=='string') throw new Error('Invalid cursor payload');
      const date=new Date(value[0]);
      if(!Number.isFinite(date.getTime())||date.toISOString()!==value[0]||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[1])) throw new Error('Invalid cursor values');
      return {occurredAt:date.toISOString(),id:value[1]};
    } catch {
      throw new BadRequestException('Audit event cursor is invalid');
    }
  }
}
