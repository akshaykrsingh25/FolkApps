import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import type { CreateLocationDto, ListLocationsDto } from './location.dto';
import { parseCentreCsv } from './centre-csv';

export interface LocationRow {
  id: string;
  parentId: string | null;
  kind: string;
  code: string | null;
  name: string;
  city: string | null;
  stateName: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatesStatus: string;
}

const LIST_LOCATIONS = `WITH RECURSIVE scope_locations(id) AS (
  SELECT scope_location_id FROM role_assignments
   WHERE organization_id = $1::uuid AND user_id = $2::uuid AND scope_location_id IS NOT NULL
  UNION
  SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id = parent.id
   WHERE child.organization_id = $1::uuid
), visible_locations(id) AS (
  SELECT id FROM scope_locations
  UNION
  SELECT id FROM locations WHERE organization_id = $1::uuid AND EXISTS (
    SELECT 1 FROM role_assignments WHERE organization_id = $1::uuid AND user_id = $2::uuid
      AND role_key = 'head_office' AND scope_location_id IS NULL
  )
)
SELECT l.id, l.parent_id AS "parentId", l.kind, l.code, l.name, l.city,
       l.state_name AS "stateName", l.latitude, l.longitude, l.coordinates_status AS "coordinatesStatus"
  FROM locations l
 WHERE l.organization_id = $1::uuid
   AND ($3::uuid IS NULL OR l.parent_id = $3::uuid)
   AND ($4::text IS NULL OR l.kind::text = $4)
   AND ($5::text IS NULL OR concat_ws(' ', l.name, l.code, l.city, l.state_name) ILIKE '%' || $5 || '%')
   AND l.id IN (SELECT id FROM visible_locations)
 ORDER BY l.state_name NULLS FIRST, l.city NULLS FIRST, l.kind, l.name
 LIMIT 500`;

@Injectable()
export class LocationsService {
  constructor(private readonly database: DatabaseService, private readonly authorization: AuthorizationService) {}

  async list(actor: ActorContext, filters: ListLocationsDto): Promise<LocationRow[]> {
    if (filters.parentId) await this.authorization.assertLocationAccess(actor, filters.parentId);
    return this.database.query<LocationRow>(LIST_LOCATIONS, [
      actor.organizationId, actor.userId, filters.parentId ?? null, filters.kind ?? null, filters.q?.trim() || null,
    ]);
  }

  async previewCentreImport(actor: ActorContext, csv: string) {
    this.assertHeadOffice(actor);
    const rows = parseCentreCsv(csv);
    const codes = rows.filter((row) => row.kind === 'centre').map((row) => row.code.toLocaleLowerCase('en-IN')).filter(Boolean);
    const existing = await this.database.query<{ code: string }>(
      `SELECT code FROM locations WHERE organization_id=$1::uuid AND kind='centre' AND lower(code)=ANY($2::text[])`,
      [actor.organizationId, codes],
    );
    const existingCodes = new Set(existing.map((row) => row.code.toLocaleLowerCase('en-IN')));
    const reviewedRows = rows.map((row) => ({ ...row, errors: [...row.errors, ...(row.kind === 'centre' && row.code && existingCodes.has(row.code.toLocaleLowerCase('en-IN')) ? ['Centre code already exists in this organization'] : [])] }));
    const invalidCount = reviewedRows.filter((row) => row.errors.length > 0).length;
    return { totalRows: reviewedRows.length, validRows: reviewedRows.length - invalidCount, invalidRows: invalidCount, canImport: invalidCount === 0, rows: reviewedRows };
  }

  async importCentres(actor: ActorContext, csv: string) {
    this.assertHeadOffice(actor);
    try {
      return await this.database.transaction(async (query) => {
        const rows = parseCentreCsv(csv);
        const centreRows = rows.filter((row) => row.kind === 'centre');
        const floorRows = rows.filter((row) => row.kind === 'floor');
        const codes = centreRows.map((row) => row.code.toLocaleLowerCase('en-IN')).filter(Boolean);
        const existing = await query<{ code: string }>(
          `SELECT code FROM locations WHERE organization_id=$1::uuid AND kind='centre' AND lower(code)=ANY($2::text[])`,
          [actor.organizationId, codes],
        );
        const existingCodes = new Set(existing.map((row) => row.code.toLocaleLowerCase('en-IN')));
        const invalid = rows.filter((row) => row.errors.length > 0 || (row.kind === 'centre' && row.code && existingCodes.has(row.code.toLocaleLowerCase('en-IN'))));
        if (invalid.length) throw new ConflictException('Resolve every CSV row issue in preview before importing');

        const stateRows = await query<{ id: string; name: string }>(
          `SELECT id,name FROM locations WHERE organization_id=$1::uuid AND kind='state'`, [actor.organizationId],
        );
        const states = new Map(stateRows.map((state) => [state.name.toLocaleLowerCase('en-IN'), state]));
        const imported: LocationRow[] = [];
        const importedFloors: LocationRow[] = [];
        const centreByCode = new Map<string, LocationRow>();
        for (const row of centreRows) {
          const stateKey = row.stateName.toLocaleLowerCase('en-IN');
          let state = states.get(stateKey);
          if (!state) {
            const created = await query<{ id: string; name: string }>(
              `INSERT INTO locations (organization_id,kind,name,state_name) VALUES ($1::uuid,'state',$2,$2) RETURNING id,name`,
              [actor.organizationId, row.stateName],
            );
            state = created[0];
            states.set(stateKey, state);
            await query(
              `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
               VALUES ($1::uuid,$2::uuid,'location.created','location',$3::uuid,$4::jsonb)`,
              [actor.organizationId, actor.userId, state.id, JSON.stringify({ kind: 'state', name: state.name, source: 'centre_csv_import' })],
            );
          }
          const created = await query<LocationRow>(
            `INSERT INTO locations (organization_id,parent_id,kind,code,name,city,state_name)
             VALUES ($1::uuid,$2::uuid,'centre',$3,$4,$5,$6)
             RETURNING id,parent_id AS "parentId",kind,code,name,city,state_name AS "stateName",latitude,longitude,coordinates_status AS "coordinatesStatus"`,
            [actor.organizationId, state.id, row.code || null, row.name, row.city, state.name],
          );
          imported.push(created[0]);
          if (row.code) centreByCode.set(row.code.toLocaleUpperCase('en-IN'), created[0]);
          await query(
            `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
             VALUES ($1::uuid,$2::uuid,'location.created','location',$3::uuid,$4::jsonb)`,
            [actor.organizationId, actor.userId, created[0].id, JSON.stringify({ kind: 'centre', code: row.code || null, name: row.name, city: row.city, state: state.name, source: 'centre_csv_import' })],
          );
        }
        for (const row of floorRows) {
          const parent = centreByCode.get(row.parentCentreCode.toLocaleUpperCase('en-IN'));
          if (!parent) throw new ConflictException('Every floor parent must be imported in the same file');
          const floor = await query<LocationRow>(
            `INSERT INTO locations (organization_id,parent_id,kind,name,city,state_name)
             VALUES ($1::uuid,$2::uuid,'floor',$3,$4,$5)
             RETURNING id,parent_id AS "parentId",kind,code,name,city,state_name AS "stateName",latitude,longitude,coordinates_status AS "coordinatesStatus"`,
            [actor.organizationId, parent.id, row.name, parent.city, parent.stateName],
          );
          importedFloors.push(floor[0]);
          await query(
            `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
             VALUES ($1::uuid,$2::uuid,'location.created','location',$3::uuid,$4::jsonb)`,
            [actor.organizationId, actor.userId, floor[0].id, JSON.stringify({ kind: 'floor', name: row.name, parentCentreCode: row.parentCentreCode, parentCentreId: parent.id, source: 'centre_csv_import' })],
          );
        }
        return { importedCount: imported.length, importedLocationCount: imported.length + importedFloors.length, centres: imported, floors: importedFloors };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('A centre code already exists; preview the file again');
      throw error;
    }
  }

  private assertHeadOffice(actor: ActorContext) {
    const allowed = actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null);
    if (!allowed) throw new ForbiddenException('Only Head Office can import the centre directory');
  }

  async create(actor: ActorContext, dto: CreateLocationDto): Promise<LocationRow> {
    this.validateCoordinates(dto);
    const headOffice = actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null);
    const allowedChildren: Record<string, { parentKinds: string[]; roles: string[] }> = {
      state: { parentKinds: [], roles: ['head_office'] },
      centre: { parentKinds: ['state'], roles: ['head_office'] },
      warehouse: { parentKinds: ['state'], roles: ['head_office'] },
      building: { parentKinds: ['centre', 'warehouse'], roles: ['head_office', 'centre_head'] },
      floor: { parentKinds: ['centre', 'building'], roles: ['head_office', 'centre_head'] },
      area: { parentKinds: ['floor'], roles: ['head_office', 'centre_head'] },
    };
    const rule = allowedChildren[dto.kind];
    if (!rule) throw new ForbiddenException('This location type cannot be created');
    if (dto.kind === 'state') {
      if (dto.parentId) throw new ConflictException('A state must be a top-level location');
      if (!headOffice) throw new ForbiddenException('Only Head Office can add a state');
    } else {
      if (!dto.parentId) throw new ConflictException('Choose the parent location first');
      await this.authorization.assertLocationAccess(actor, dto.parentId, rule.roles);
      const parents = await this.database.query<{ kind: string }>(
        'SELECT kind FROM locations WHERE organization_id = $1::uuid AND id = $2::uuid',
        [actor.organizationId, dto.parentId],
      );
      if (!parents[0]) throw new NotFoundException('Parent location was not found');
      if (!rule.parentKinds.includes(parents[0].kind)) {
        throw new ConflictException(`${dto.kind} must be added inside ${rule.parentKinds.join(' or ')}`);
      }
    }

    try {
      return await this.database.transaction(async (query) => {
        const rows = await query<LocationRow>(
          `INSERT INTO locations (organization_id,parent_id,kind,code,name,city,state_name,latitude,longitude,coordinates_status)
           VALUES ($1::uuid,$2::uuid,$3::location_kind,$4,$5,$6,$7,$8,$9,
             CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL THEN 'unverified' ELSE 'city_level' END)
           RETURNING id,parent_id AS "parentId",kind,code,name,city,state_name AS "stateName",latitude,longitude,coordinates_status AS "coordinatesStatus"`,
          [actor.organizationId, dto.parentId ?? null, dto.kind, dto.code ?? null, dto.name.trim(), dto.city ?? null,
            dto.stateName ?? null, dto.latitude ?? null, dto.longitude ?? null],
        );
        const location = rows[0];
        await query(
          `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
           VALUES ($1::uuid,$2::uuid,'location.created','location',$3::uuid,$4::jsonb)`,
          [actor.organizationId, actor.userId, location.id, JSON.stringify({ kind: location.kind, name: location.name })],
        );
        return location;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('That location code is already in use');
      throw error;
    }
  }

  async confirmCoordinates(actor:ActorContext,id:string,coordinates:{latitude:number;longitude:number}):Promise<LocationRow> {
    const rows=await this.database.query<{kind:string}>('SELECT kind FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,id]);
    if(!rows[0]) throw new NotFoundException('Location was not found');
    if(rows[0].kind!=='centre') throw new ConflictException('Map pins can only be confirmed for centre locations');
    await this.authorization.assertLocationAccess(actor,id,['head_office','state_head','centre_head']);
    const coordinatesStatus=actor.memberships.some((membership)=>membership.role==='head_office'||membership.role==='state_head')?'verified':'centre_head_confirmed';
    return this.database.transaction(async(query)=>{
      const updated=await query<LocationRow>(`UPDATE locations SET latitude=$3,longitude=$4,coordinates_status=$5
        WHERE organization_id=$1::uuid AND id=$2::uuid RETURNING id,parent_id AS "parentId",kind,code,name,city,state_name AS "stateName",latitude,longitude,coordinates_status AS "coordinatesStatus"`,
        [actor.organizationId,id,coordinates.latitude,coordinates.longitude,coordinatesStatus]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'location.coordinates_confirmed','location',$3::uuid,$4::jsonb)`,[actor.organizationId,actor.userId,id,JSON.stringify({...coordinates,coordinatesStatus})]);
      return updated[0];
    });
  }

  private validateCoordinates(dto: CreateLocationDto) {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new ConflictException('Enter both latitude and longitude, or leave both blank');
    }
  }
}
