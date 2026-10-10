import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { DatabaseService } from '../database.service';

const ACCESSIBLE=`WITH RECURSIVE scope_locations(id) AS (
  SELECT scope_location_id FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
  UNION SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
), visible_locations(id) AS (
  SELECT id FROM scope_locations UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS(
    SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND role_key='head_office' AND scope_location_id IS NULL)
)`;

@Injectable()
export class InsightsService {
  constructor(private readonly database:DatabaseService) {}

  async alerts(actor:ActorContext) {
    return this.database.query(
      `${ACCESSIBLE}, visible_ancestors(id) AS (
         SELECT id FROM visible_locations
         UNION SELECT parent.id FROM visible_ancestors child
           JOIN locations current_location ON current_location.organization_id=$1::uuid AND current_location.id=child.id
           JOIN locations parent ON parent.organization_id=$1::uuid AND parent.id=current_location.parent_id
       ), cycle_places(cycle_id,location_id) AS (
         SELECT c.id,c.scope_location_id FROM verification_cycles c
         WHERE c.organization_id=$1::uuid AND c.grace_ends_at<now() AND c.status<>'closed'
           AND c.scope_location_id IN (SELECT id FROM visible_ancestors)
         UNION ALL SELECT p.cycle_id,child.id FROM cycle_places p
           JOIN locations child ON child.organization_id=$1::uuid AND child.parent_id=p.location_id
       ), duplicate_serials AS (
         SELECT lower(btrim(a.serial_number)) AS serial_key,min(a.id::text)::uuid AS asset_id,count(*)::integer AS duplicate_count
         FROM assets a WHERE a.organization_id=$1::uuid AND a.location_id IN (SELECT id FROM visible_locations)
           AND NULLIF(btrim(a.serial_number),'') IS NOT NULL
         GROUP BY lower(btrim(a.serial_number)) HAVING count(*)>1
       ), alert_rows AS (
         SELECT 'missing:'||a.id::text AS id,'missing' AS kind,'high' AS severity,'Asset marked missing' AS title,
           'Review the last known location and record the investigation outcome.' AS description,
           a.id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",l.name AS "locationName",a.updated_at AS "occurredAt",NULL::uuid AS "relatedId"
         FROM assets a JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
         WHERE a.organization_id=$1::uuid AND a.status='missing' AND a.location_id IN (SELECT id FROM visible_locations)
         UNION ALL
         SELECT 'unseen:'||c.id::text||':'||a.id::text,'verification_overdue','medium','Not seen after the scan window',
           'Contact the centre and check the last recorded location. This is not a confirmed loss.',
           a.id,a.asset_tag,a.name,l.name,c.grace_ends_at,c.id
         FROM cycle_places p JOIN verification_cycles c ON c.organization_id=$1::uuid AND c.id=p.cycle_id
         JOIN assets a ON a.organization_id=$1::uuid AND a.location_id=p.location_id
         JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
         WHERE p.location_id IN (SELECT id FROM visible_locations)
           AND NOT EXISTS(SELECT 1 FROM scan_events s WHERE s.organization_id=$1::uuid AND s.cycle_id=c.id AND s.asset_id=a.id)
         UNION ALL
         SELECT 'duplicate-serial:'||d.serial_key,'duplicate_serial','high','Serial number appears more than once',
           d.duplicate_count::text||' visible asset records share serial number “'||a.serial_number||'”. Compare the item and invoice before merging anything.',
           a.id,a.asset_tag,a.name,l.name,a.updated_at,NULL::uuid
         FROM duplicate_serials d JOIN assets a ON a.organization_id=$1::uuid AND a.id=d.asset_id
         JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
         UNION ALL
         SELECT 'transfer:'||t.id::text,'transfer_stalled','medium','Transfer needs a next step',
           'This movement has been open for more than seven days. Confirm approval, dispatch, or receipt.',
           a.id,a.asset_tag,a.name,src.name,t.requested_at,t.id
         FROM transfer_requests t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id
         JOIN locations src ON src.organization_id=t.organization_id AND src.id=t.from_location_id
         WHERE t.organization_id=$1::uuid AND t.status IN ('requested','approved','in_transit')
           AND t.requested_at<now()-interval '7 days'
           AND t.from_location_id IN (SELECT id FROM visible_locations)
         UNION ALL
         SELECT 'batch-transfer:'||b.id::text||':'||a.id::text,'transfer_stalled','medium','Batch transfer needs a next step',
           'Manifest '||b.batch_reference||' has been in transit beyond its seven-day review window.',
           a.id,a.asset_tag,a.name,src.name,b.auto_flag_after,b.id
         FROM transfer_batches b JOIN transfer_batch_items i ON i.organization_id=b.organization_id AND i.batch_id=b.id AND i.receipt_status='pending'
         JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
         JOIN locations src ON src.organization_id=b.organization_id AND src.id=b.from_location_id
         WHERE b.organization_id=$1::uuid AND b.status='in_transit' AND b.auto_flag_after<=now()
           AND b.from_location_id IN (SELECT id FROM visible_locations)
         UNION ALL
         SELECT 'batch-discrepancy:'||b.id::text||':'||a.id::text,'transfer_discrepancy',
           CASE WHEN i.receipt_status='not_received' THEN 'high' ELSE 'medium' END,
           CASE WHEN i.receipt_status='not_received' THEN 'Item not confirmed at destination' ELSE 'Asset arrived damaged' END,
           'Manifest '||b.batch_reference||': '||COALESCE(i.receipt_discrepancy_note,'Review the item and confirm its recorded condition.'),
           a.id,a.asset_tag,a.name,l.name,i.scanned_at_receipt,b.id
         FROM transfer_batch_items i JOIN transfer_batches b ON b.organization_id=i.organization_id AND b.id=i.batch_id
         JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
         JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
         WHERE i.organization_id=$1::uuid AND i.receipt_status='not_received'
           AND NOT EXISTS(SELECT 1 FROM scan_events s WHERE s.organization_id=i.organization_id AND s.asset_id=i.asset_id AND s.scanned_at>i.scanned_at_receipt)
           AND a.status<>'missing'
           AND (a.location_id IN (SELECT id FROM visible_locations) OR b.from_location_id IN (SELECT id FROM visible_locations) OR b.to_location_id IN (SELECT id FROM visible_locations))
         UNION ALL
         SELECT 'report:'||r.id::text,'urgent_report','high','Urgent asset report is unresolved',
           r.description,a.id,a.asset_tag,a.name,l.name,r.reported_at,r.id
         FROM condition_reports r JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id
         JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
         WHERE r.organization_id=$1::uuid AND r.urgency='urgent' AND r.status NOT IN ('resolved','closed') AND a.location_id IN (SELECT id FROM visible_locations)
       ) SELECT * FROM alert_rows
       ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,"occurredAt" DESC,id LIMIT 200`,
      [actor.organizationId,actor.userId]);
  }

  async overview(actor:ActorContext) {
    const rows=await this.database.query(
      `${ACCESSIBLE}, visible_ancestors(id) AS (
        SELECT id FROM visible_locations
        UNION
        SELECT parent.id FROM visible_ancestors child
        JOIN locations current_location ON current_location.organization_id=$1::uuid AND current_location.id=child.id
        JOIN locations parent ON parent.organization_id=$1::uuid AND parent.id=current_location.parent_id
       ), active_cycles AS (
        SELECT c.id,c.scope_location_id FROM verification_cycles c
        WHERE c.organization_id=$1::uuid AND c.status IN ('open','grace')
          AND c.scope_location_id IN (SELECT id FROM visible_ancestors)
       ), cycle_places(cycle_id,location_id) AS (
        SELECT id,scope_location_id FROM active_cycles
        UNION ALL SELECT p.cycle_id,child.id FROM cycle_places p JOIN locations child ON child.parent_id=p.location_id AND child.organization_id=$1::uuid
       ), cycle_totals AS (
        SELECT count(*) AS total FROM cycle_places p JOIN assets a ON a.organization_id=$1::uuid AND a.location_id=p.location_id
        WHERE p.location_id IN (SELECT id FROM visible_locations)
       ), scanned_totals AS (
        SELECT count(DISTINCT (s.cycle_id,s.asset_id)) AS total FROM scan_events s JOIN active_cycles c ON c.id=s.cycle_id
        WHERE s.organization_id=$1::uuid AND s.location_id IN (SELECT id FROM visible_locations)
       )
       SELECT (SELECT count(*) FROM assets a WHERE a.organization_id=$1::uuid AND a.location_id IN (SELECT id FROM visible_locations)) AS "assetCount",
        (SELECT count(*) FROM locations l WHERE l.organization_id=$1::uuid AND l.kind IN ('centre','warehouse') AND l.id IN (SELECT id FROM visible_locations)) AS "centreCount",
        (SELECT count(*) FROM assets a WHERE a.organization_id=$1::uuid AND a.status='missing' AND a.location_id IN (SELECT id FROM visible_locations)) AS "missingCount",
        (SELECT count(*) FROM assets a WHERE a.organization_id=$1::uuid AND a.status IN ('in_repair','out_of_service') AND a.location_id IN (SELECT id FROM visible_locations)) AS "attentionCount",
        (SELECT count(*) FROM assets a WHERE a.organization_id=$1::uuid AND a.status='unused' AND a.location_id IN (SELECT id FROM visible_locations)) AS "unusedCount",
        (SELECT count(*) FROM condition_reports r JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id WHERE r.organization_id=$1::uuid AND r.status NOT IN ('resolved','closed') AND a.location_id IN (SELECT id FROM visible_locations)) AS "openReportCount",
        (SELECT count(*) FROM warranties w JOIN assets a ON a.organization_id=w.organization_id AND a.id=w.asset_id WHERE w.organization_id=$1::uuid AND w.ends_on BETWEEN current_date AND current_date+90 AND a.location_id IN (SELECT id FROM visible_locations)) AS "warrantyExpiringCount",
        (SELECT count(*) FROM active_cycles) AS "activeCycleCount",
        ((SELECT count(*) FROM transfer_requests t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id WHERE t.organization_id=$1::uuid AND t.status IN ('requested','approved','in_transit') AND (a.location_id IN (SELECT id FROM visible_locations) OR t.from_location_id IN (SELECT id FROM visible_locations) OR t.to_location_id IN (SELECT id FROM visible_locations))) +
         (SELECT count(*) FROM transfer_batches b WHERE b.organization_id=$1::uuid AND b.status IN ('requested','approved','in_transit') AND (b.from_location_id IN (SELECT id FROM visible_locations) OR b.to_location_id IN (SELECT id FROM visible_locations)))) AS "openTransferCount",
        CASE WHEN (SELECT total FROM cycle_totals)=0 THEN 0 ELSE round(100.0*(SELECT total FROM scanned_totals)/(SELECT total FROM cycle_totals))::integer END AS "scanCompletionPercent"`,[actor.organizationId,actor.userId]);
    return rows[0];
  }

  async map(actor:ActorContext) {
    const centres=await this.database.query(
      `${ACCESSIBLE}, centre_rows AS (
        SELECT c.id,c.name,c.code,c.city,COALESCE(NULLIF(c.state_name,''),s.name) AS "stateName",c.latitude,c.longitude,c.coordinates_status AS "coordinatesStatus"
        FROM locations c LEFT JOIN locations s ON s.organization_id=c.organization_id AND s.id=c.parent_id
        WHERE c.organization_id=$1::uuid AND c.kind='centre' AND c.active=true AND c.id IN (SELECT id FROM visible_locations)
       ), descendants(centre_id,location_id) AS (
        SELECT id,id FROM centre_rows UNION ALL SELECT d.centre_id,child.id FROM descendants d JOIN locations child ON child.parent_id=d.location_id WHERE child.organization_id=$1::uuid
       ), stats AS (
        SELECT d.centre_id,count(DISTINCT a.id) AS "assetCount",
          count(DISTINCT a.id) FILTER (WHERE a.status='missing') AS "missingCount",
          count(DISTINCT a.id) FILTER (WHERE a.status IN ('in_repair','out_of_service')) AS "attentionCount",
          count(DISTINCT a.id) FILTER (WHERE a.status='unused') AS "unusedCount"
        FROM descendants d LEFT JOIN assets a ON a.organization_id=$1::uuid AND a.location_id=d.location_id GROUP BY d.centre_id
       ), result AS (
        SELECT c.id,c.name,c.code,c.city,c."stateName",c.latitude,c.longitude,c."coordinatesStatus",
          COALESCE(s."assetCount",0) AS "assetCount",COALESCE(s."missingCount",0) AS "missingCount",
          COALESCE(s."attentionCount",0) AS "attentionCount",COALESCE(s."unusedCount",0) AS "unusedCount"
        FROM centre_rows c LEFT JOIN stats s ON s.centre_id=c.id
       ) SELECT * FROM result ORDER BY "stateName",city,name`,[actor.organizationId,actor.userId]);
    const stateMap=new Map<string,{stateName:string;centreCount:number;assetCount:number;missingCount:number;attentionCount:number;unusedCount:number}>();
    for(const centre of centres){
      const stateName=centre.stateName||'State not recorded';
      const row=stateMap.get(stateName)||{stateName,centreCount:0,assetCount:0,missingCount:0,attentionCount:0,unusedCount:0};
      row.centreCount+=1; row.assetCount+=Number(centre.assetCount); row.missingCount+=Number(centre.missingCount); row.attentionCount+=Number(centre.attentionCount); row.unusedCount+=Number(centre.unusedCount); stateMap.set(stateName,row);
    }
    return {states:[...stateMap.values()].sort((a,b)=>a.stateName.localeCompare(b.stateName)),centres};
  }
}
