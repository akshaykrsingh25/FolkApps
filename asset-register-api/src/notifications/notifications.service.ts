import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { DatabaseService } from '../database.service';
import { InsightsService } from '../insights/insights.service';

interface AlertSnapshot {
  id: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  locationName: string;
  occurredAt: string;
  relatedId: string | null;
}

export interface NotificationRow {
  id: string;
  sourceAlertId: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  locationName: string;
  relatedId: string | null;
  occurredAt: Date | string;
  createdAt: Date | string;
  readAt: Date | string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService, private readonly insights: InsightsService) {}

  async list(actor: ActorContext, cursor?: string) {
    const decodedCursor = cursor ? this.decodeCursor(cursor) : null;
    const activeAlerts = await this.insights.alerts(actor) as AlertSnapshot[];
    if (activeAlerts.length) {
      await this.database.query(
        `INSERT INTO notification_inbox (
           organization_id,recipient_user_id,notification_key,kind,severity,title,description,
           asset_id,asset_tag,asset_name,location_name,related_id,occurred_at
         )
         SELECT $1::uuid,$2::uuid,item.id,item.kind,item.severity,item.title,item.description,
                item."assetId",item."assetTag",item."assetName",item."locationName",item."relatedId",item."occurredAt"
           FROM jsonb_to_recordset($3::jsonb) AS item(
             id text,kind text,severity text,title text,description text,"assetId" uuid,
             "assetTag" text,"assetName" text,"locationName" text,"relatedId" uuid,"occurredAt" timestamptz
           )
         ON CONFLICT (organization_id,recipient_user_id,notification_key) DO NOTHING`,
        [actor.organizationId, actor.userId, JSON.stringify(activeAlerts)],
      );
    }

    const [items, counts] = await Promise.all([
      this.database.query<NotificationRow>(
        `${this.visibleLocationsCte()}
         SELECT n.id,n.notification_key AS "sourceAlertId",n.kind,n.severity,n.title,n.description,
                n.asset_id AS "assetId",n.asset_tag AS "assetTag",n.asset_name AS "assetName",
                l.name AS "locationName",n.related_id AS "relatedId",n.occurred_at AS "occurredAt",
                n.created_at AS "createdAt",n.read_at AS "readAt"
           FROM notification_inbox n JOIN assets a
             ON a.organization_id=n.organization_id AND a.id=n.asset_id
           JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
          WHERE n.organization_id=$1::uuid AND n.recipient_user_id=$2::uuid
            AND a.location_id IN (SELECT id FROM visible_locations)
            AND ($3::timestamptz IS NULL OR (n.created_at,n.id)<($3::timestamptz,$4::uuid))
          ORDER BY n.created_at DESC,n.id DESC LIMIT 51`,
        [actor.organizationId, actor.userId, decodedCursor?.createdAt ?? null, decodedCursor?.id ?? null],
      ),
      this.database.query<{ unreadCount: number | string }>(
        `${this.visibleLocationsCte()}
         SELECT count(*) FILTER (WHERE n.read_at IS NULL)::integer AS "unreadCount"
           FROM notification_inbox n JOIN assets a
             ON a.organization_id=n.organization_id AND a.id=n.asset_id
          WHERE n.organization_id=$1::uuid AND n.recipient_user_id=$2::uuid
            AND a.location_id IN (SELECT id FROM visible_locations)`,
        [actor.organizationId, actor.userId],
      ),
    ]);
    const hasMore = items.length > 50;
    const page = hasMore ? items.slice(0, 50) : items;
    return {
      items: page,
      unreadCount: Number(counts[0]?.unreadCount ?? 0),
      nextCursor: hasMore ? this.encodeCursor(page[page.length - 1]) : null,
    };
  }

  async markRead(actor: ActorContext, id: string) {
    const rows = await this.database.query<{ id: string; readAt: string }>(
      `${this.visibleLocationsCte()}
       UPDATE notification_inbox n SET read_at=COALESCE(n.read_at,now())
         FROM assets a
        WHERE n.organization_id=$1::uuid AND n.recipient_user_id=$2::uuid AND n.id=$3::uuid
          AND a.organization_id=n.organization_id AND a.id=n.asset_id
          AND a.location_id IN (SELECT id FROM visible_locations)
       RETURNING n.id,n.read_at AS "readAt"`,
      [actor.organizationId, actor.userId, id],
    );
    if (!rows[0]) throw new NotFoundException('Notification was not found');
    return rows[0];
  }

  private visibleLocationsCte() {
    return `WITH RECURSIVE scope_locations(id) AS (
      SELECT scope_location_id FROM role_assignments
       WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
      UNION
      SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id=parent.id
       WHERE child.organization_id=$1::uuid
    ), visible_locations(id) AS (
      SELECT id FROM scope_locations
      UNION
      SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS (
        SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid
          AND role_key='head_office' AND scope_location_id IS NULL
      )
    )`;
  }

  private encodeCursor(item: { createdAt: string | Date; id: string }) {
    return Buffer.from(JSON.stringify([new Date(item.createdAt).toISOString(), item.id]), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string) {
    try {
      if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor format');
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string') {
        throw new Error('Invalid cursor payload');
      }
      const date = new Date(value[0]);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== value[0] || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[1])) {
        throw new Error('Invalid cursor values');
      }
      return { createdAt: date.toISOString(), id: value[1] };
    } catch {
      throw new BadRequestException('Notification cursor is invalid');
    }
  }
}
