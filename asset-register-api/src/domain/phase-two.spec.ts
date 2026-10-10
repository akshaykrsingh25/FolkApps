import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthorizationService } from '../authorization/authorization.service';
import type { ActorContext } from '../auth/authenticated-request';
import { AssetsService } from '../assets/assets.service';
import { LocationsService } from '../locations/locations.service';

describe('phase two: location and asset workflows', () => {
  let db: PGlite;
  let organizationId: string;
  let userId: string;
  let actor: ActorContext;
  let headOffice: ActorContext;
  let locations: LocationsService;
  let assets: AssetsService;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    const migration = await readFile(new URL('../../database/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const organization = await db.query<{ id: string }>(`INSERT INTO organizations (name,slug) VALUES ('Phase Two','phase-two') RETURNING id`);
    organizationId = organization.rows[0].id;
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'head-office-test','Head Office','ho@example.test') RETURNING id`,
      [organizationId],
    );
    userId = user.rows[0].id;
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key) VALUES ($1,$2,'head_office')`, [organizationId,userId]);
    actor = { userId, organizationId, subject: 'head-office-test', memberships: [{ role: 'head_office', scopeLocationId: null }] };
    headOffice = actor;

    const query = async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
      (await db.query<Row>(sql, [...values])).rows;
    const database = {
      query,
      transaction: async <T>(work: (transactionQuery: typeof query) => Promise<T>) =>
        db.transaction(async (tx) => work(async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
          (await tx.query<Row>(sql, [...values])).rows)),
    };
    const authorization = new AuthorizationService(database as never);
    locations = new LocationsService(database as never, authorization);
    assets = new AssetsService(database as never, authorization);
  });

  afterAll(async () => { await db.close(); });

  it('creates the location hierarchy, audits it, and rejects invalid parent levels', async () => {
    const state = await locations.create(headOffice, { kind: 'state', name: 'Gujarat' });
    const centre = await locations.create(headOffice, { kind: 'centre', name: 'Ahmedabad Krish Cubicle', code: 'AHKC', parentId: state.id, city: 'Ahmedabad', stateName: 'Gujarat' });
    const building = await locations.create(headOffice, { kind: 'building', name: 'Main building', parentId: centre.id });
    const floor = await locations.create(headOffice, { kind: 'floor', name: 'Floor 4', parentId: building.id });
    await expect(locations.create(headOffice, { kind: 'floor', name: 'Invalid floor', parentId: centre.id })).rejects.toMatchObject({ status: 409 });
    expect((await locations.list(headOffice, { parentId: state.id })).map((item) => item.code)).toContain('AHKC');
    const audit = await db.query<{ count: number | string }>(`SELECT count(*) FROM audit_events WHERE organization_id=$1 AND entity_type='location'`, [organizationId]);
    expect(Number(audit.rows[0].count)).toBe(4);
    expect(floor.coordinatesStatus).toBe('unverified');
  });

  it('creates searchable assets, returns an opaque QR identity, and records audit atomically', async () => {
    const centre = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND code='AHKC'`, [organizationId]);
    const created = await assets.create(actor, { locationId: centre.rows[0].id, name: 'Network switch', category: 'IT equipment', serialNumber: 'SN-889', purchaseAmount: 12000 });
    expect(created.assetTag).toMatch(/^INC-[0-9A-F]{12}$/);
    expect(created.qrPublicId).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await assets.getByQr(actor, created.qrPublicId)).id).toBe(created.id);
    expect((await assets.list(actor, { q: 'SN-889' })).data[0].id).toBe(created.id);
    const edited = await assets.update(actor, created.id, { name: 'Core network switch', condition: 'fair', status: 'in_repair' });
    expect(edited.name).toBe('Core network switch');
    expect(edited.status).toBe('in_repair');
    expect(edited.qrPublicId).toBe(created.qrPublicId);
    const audit = await db.query<{ count: number | string }>(`SELECT count(*) FROM audit_events WHERE organization_id=$1 AND entity_type='asset' AND entity_id=$2`, [organizationId,created.id]);
    expect(Number(audit.rows[0].count)).toBe(2);

    const clientRequestId = '80000000-0000-4000-8000-000000000001';
    const offlineCreate = await assets.create(actor, { locationId: centre.rows[0].id, name: 'Offline projector', category: 'AV equipment', clientRequestId });
    const retriedCreate = await assets.create(actor, { locationId: centre.rows[0].id, name: 'A second copy', category: 'AV equipment', clientRequestId });
    expect(retriedCreate.id).toBe(offlineCreate.id);
    expect(retriedCreate.name).toBe('Offline projector');
    const retryAudit = await db.query<{ count: number | string }>(`SELECT count(*) FROM audit_events WHERE organization_id=$1 AND entity_type='asset' AND entity_id=$2`, [organizationId,offlineCreate.id]);
    expect(Number(retryAudit.rows[0].count)).toBe(1);
  });

  it('rejects duplicate asset tags and out-of-scope centre-head writes', async () => {
    const locationsRows = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND code='AHKC'`, [organizationId]);
    const targetLocationId = locationsRows.rows[0].id;
    await assets.create(actor, { locationId: targetLocationId, assetTag: 'MANUAL-1', name: 'Desk', category: 'Furniture' });
    await expect(assets.create(actor, { locationId: targetLocationId, assetTag: 'MANUAL-1', name: 'Another desk', category: 'Furniture' }))
      .rejects.toMatchObject({ status: 409 });

    const state = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND kind='state'`, [organizationId]);
    const otherCentre = await locations.create(actor, { kind: 'centre', name: 'Surat Centre', parentId: state.rows[0].id, code: 'SURAT' });
    const centreHead = await db.query<{ id: string }>(`INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'centre-head-test','Centre Head','centre@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId,centreHead.rows[0].id,targetLocationId]);
    const centreActor: ActorContext = { userId: centreHead.rows[0].id, organizationId, subject: 'centre-head-test', memberships: [{ role: 'centre_head', scopeLocationId: targetLocationId }] };
    await expect(assets.create(centreActor, { locationId: otherCentre.id, name: 'Out of scope', category: 'Furniture' }))
      .rejects.toMatchObject({ status: 403 });

    const registered = await assets.create(actor, { locationId: targetLocationId, name: 'Shared desk', category: 'Furniture' });
    const viewer = await db.query<{ id: string }>(`INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'viewer-test','Viewer','viewer@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'viewer',$3)`, [organizationId,viewer.rows[0].id,targetLocationId]);
    const viewerActor: ActorContext = { userId: viewer.rows[0].id, organizationId, subject: 'viewer-test', memberships: [{ role: 'viewer', scopeLocationId: targetLocationId }] };
    await expect(assets.update(viewerActor, registered.id, { name: 'Unauthorized edit' })).rejects.toMatchObject({ status: 403 });
  });

  it('previews and imports a centre CSV atomically, with explicit state and duplicate review', async () => {
    const csv = 'Center Code,Center Name,City,State\nCSV-01,"New, Ahmedabad Centre",Ahmedabad,Gujarat\nCSV-02,Surat Workspace,Surat,Gujarat\n';
    const preview = await locations.previewCentreImport(headOffice, csv);
    expect(preview).toMatchObject({ totalRows: 2, validRows: 2, invalidRows: 0, canImport: true });
    const imported = await locations.importCentres(headOffice, csv);
    expect(imported).toMatchObject({ importedCount: 2 });
    expect(imported.centres[0]).toMatchObject({ code: 'CSV-01', name: 'New, Ahmedabad Centre', stateName: 'Gujarat' });
    const duplicatePreview = await locations.previewCentreImport(headOffice, csv);
    expect(duplicatePreview).toMatchObject({ canImport: false, invalidRows: 2 });
    await expect(locations.importCentres(headOffice, csv)).rejects.toMatchObject({ status: 409 });
    const stateRows = await db.query<{ count: string }>(`SELECT count(*) FROM locations WHERE organization_id=$1 AND kind='state' AND lower(name)='gujarat'`, [organizationId]);
    expect(Number(stateRows.rows[0].count)).toBe(1);

    const viewer = await db.query<{ id: string }>(`SELECT id FROM users WHERE organization_id=$1 AND identity_subject='viewer-test'`, [organizationId]);
    const viewerActor: ActorContext = { userId: viewer.rows[0].id, organizationId, subject: 'viewer-test', memberships: [{ role: 'viewer', scopeLocationId: null }] };
    await expect(locations.previewCentreImport(viewerActor, csv)).rejects.toMatchObject({ status: 403 });
  });
});
