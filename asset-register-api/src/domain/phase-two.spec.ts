import { readFile } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthorizationService } from '../authorization/authorization.service';
import type { ActorContext } from '../auth/authenticated-request';
import { AssetsService } from '../assets/assets.service';
import { SignedQrService } from '../assets/signed-qr.service';
import { LocationsService } from '../locations/locations.service';

describe('phase two: location and asset workflows', () => {
  let db: PGlite;
  let organizationId: string;
  let userId: string;
  let actor: ActorContext;
  let headOffice: ActorContext;
  let locations: LocationsService;
  let assets: AssetsService;
  let legacyRfidOrganizationId: string;
  let legacyRfidAssetId: string;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    const migration = await readFile(new URL('../../database/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const ownershipAndBatchesMigration = await readFile(new URL('../../database/migrations/003_ownership_and_transfer_batches.sql', import.meta.url), 'utf8');
    await db.exec(ownershipAndBatchesMigration);
    const scopedRbacMigration = await readFile(new URL('../../database/migrations/004_scoped_rbac_and_user_profiles.sql', import.meta.url), 'utf8');
    await db.exec(scopedRbacMigration);
    const dualIdentifierMigration = await readFile(new URL('../../database/migrations/005_dual_asset_identifiers.sql', import.meta.url), 'utf8');
    await db.exec(dualIdentifierMigration);
    await db.exec(await readFile(new URL('../../database/migrations/006_background_asset_exports.sql', import.meta.url), 'utf8'));
    const legacyOrganization = await db.query<{id:string}>(`INSERT INTO organizations(name,slug) VALUES ('Legacy RFID Org','legacy-rfid-org') RETURNING id`);
    legacyRfidOrganizationId = legacyOrganization.rows[0].id;
    const legacyUser = await db.query<{id:string}>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'legacy-rfid-user','Legacy RFID User','legacy-rfid@example.test') RETURNING id`,[legacyRfidOrganizationId]);
    const legacyLocation = await db.query<{id:string}>(`INSERT INTO locations(organization_id,kind,name) VALUES ($1,'centre','Legacy RFID Centre') RETURNING id`,[legacyRfidOrganizationId]);
    const legacyAsset = await db.query<{id:string}>(
      `INSERT INTO assets(organization_id,location_id,asset_tag,name,category,rfid_epc,created_by)
       VALUES ($1,$2,'LEGACY-RFID-1','Legacy switch','IT equipment','E2801160600000000000034A',$3::uuid) RETURNING id`,
      [legacyRfidOrganizationId,legacyLocation.rows[0].id,legacyUser.rows[0].id],
    );
    legacyRfidAssetId = legacyAsset.rows[0].id;
    await db.exec(await readFile(new URL('../../database/migrations/007_rfid_binding_history.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../database/migrations/008_location_physical_addresses.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../database/migrations/009_notification_inbox.sql', import.meta.url), 'utf8'));
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
    assets = new AssetsService(database as never, authorization, new SignedQrService());
  });

  afterAll(async () => { await db.close(); });

  it('backfills existing EPC assignments into the permanent tag history', async () => {
    const rows = await db.query<{epc:string;bound_by:string;retired_at:string|null}>(
      `SELECT epc,bound_by,retired_at FROM asset_rfid_bindings WHERE organization_id=$1::uuid AND asset_id=$2::uuid`,
      [legacyRfidOrganizationId,legacyRfidAssetId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({epc:'E2801160600000000000034A',retired_at:null});
    expect(rows.rows[0].bound_by).toBeTruthy();
  });

  it('creates the location hierarchy, audits it, and rejects invalid parent levels', async () => {
    const state = await locations.create(headOffice, { kind: 'state', name: 'Gujarat' });
    const centre = await locations.create(headOffice, { kind: 'centre', name: 'Ahmedabad Krish Cubicle', code: 'AHKC', parentId: state.id, city: 'Ahmedabad', stateName: 'Gujarat', physicalAddress: 'Tower 4, SG Highway, Ahmedabad' });
    const building = await locations.create(headOffice, { kind: 'building', name: 'Main building', parentId: centre.id });
    const floor = await locations.create(headOffice, { kind: 'floor', name: 'Floor 4', parentId: building.id });
    const directFloor = await locations.create(headOffice, { kind: 'floor', name: 'Floor 2', parentId: centre.id });
    await expect(locations.create(headOffice, { kind: 'area', name: 'Invalid area', parentId: centre.id })).rejects.toMatchObject({ status: 409 });
    expect((await locations.list(headOffice, { parentId: state.id })).map((item) => item.code)).toContain('AHKC');
    const audit = await db.query<{ count: number | string }>(`SELECT count(*) FROM audit_events WHERE organization_id=$1 AND entity_type='location'`, [organizationId]);
    expect(Number(audit.rows[0].count)).toBe(5);
    expect(floor.coordinatesStatus).toBe('unverified');
    expect(directFloor.parentId).toBe(centre.id);
    expect(centre).toMatchObject({physicalAddress:'Tower 4, SG Highway, Ahmedabad',physicalAddressStatus:'unverified'});
  });

  it('audits centre address and coordinate confirmation by role, and supports clearing an address', async () => {
    const state=await locations.create(headOffice,{kind:'state',name:'Address State'});
    const centre=await locations.create(headOffice,{kind:'centre',name:'Address Centre',parentId:state.id,city:'Ahmedabad',stateName:'Gujarat',physicalAddress:'Old address'});
    const manager=await db.query<{id:string}>(`INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'address-centre-head','Address Centre Head','address-centre@example.test') RETURNING id`,[organizationId]);
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`,[organizationId,manager.rows[0].id,centre.id]);
    const centreActor:ActorContext={userId:manager.rows[0].id,organizationId,subject:'address-centre-head',memberships:[{role:'centre_head',scopeLocationId:centre.id}]};

    const confirmed=await locations.confirmCoordinates(centreActor,centre.id,{latitude:23.0225,longitude:72.5714,physicalAddress:'Building A, SG Highway, Ahmedabad'});
    expect(confirmed).toMatchObject({coordinatesStatus:'centre_head_confirmed',physicalAddress:'Building A, SG Highway, Ahmedabad',physicalAddressStatus:'centre_head_confirmed'});
    const headquartersConfirmed=await locations.confirmCoordinates(headOffice,centre.id,{latitude:23.0226,longitude:72.5715});
    expect(headquartersConfirmed).toMatchObject({coordinatesStatus:'verified',physicalAddress:'Building A, SG Highway, Ahmedabad',physicalAddressStatus:'centre_head_confirmed'});
    const verifiedAddress=await locations.confirmCoordinates(headOffice,centre.id,{latitude:23.0226,longitude:72.5715,physicalAddress:'Building A, SG Highway, Ahmedabad 380015'});
    expect(verifiedAddress).toMatchObject({physicalAddress:'Building A, SG Highway, Ahmedabad 380015',physicalAddressStatus:'verified'});
    const cleared=await locations.confirmCoordinates(headOffice,centre.id,{latitude:23.0226,longitude:72.5715,physicalAddress:null});
    expect(cleared).toMatchObject({physicalAddress:null,physicalAddressStatus:'unverified'});
    const audit=await db.query<{details:{physicalAddressBefore:string|null;physicalAddressAfter:string|null;physicalAddressStatus:string}}>(
      `SELECT details FROM audit_events WHERE organization_id=$1 AND entity_id=$2 AND event_type='location.coordinates_confirmed'`,[organizationId,centre.id]);
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows.map((row)=>row.details.physicalAddressStatus)).toEqual(expect.arrayContaining(['centre_head_confirmed','unchanged','verified','unverified']));
    expect(audit.rows.map((row)=>row.details)).toEqual(expect.arrayContaining([expect.objectContaining({physicalAddressBefore:'Building A, SG Highway, Ahmedabad 380015',physicalAddressAfter:null})]));
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

  it('requires a reason to retire an RFID EPC and prevents retired tags from being reused', async () => {
    const centre = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND code='AHKC'`, [organizationId]);
    const asset = await assets.create(actor, { locationId: centre.rows[0].id, name: 'RFID lifecycle test', category: 'IT', rfidEpc: 'e2801160600000000000034a' });
    expect(asset.rfidEpc).toBe('E2801160600000000000034A');
    await expect(assets.update(actor, asset.id, { rfidEpc: 'E2801160600000000000034B' }))
      .rejects.toMatchObject({ status: 400 });

    const rebound = await assets.update(actor, asset.id, { rfidEpc: 'E2801160600000000000034B', rfidChangeReason: 'Original tag damaged and replaced' });
    expect(rebound.rfidEpc).toBe('E2801160600000000000034B');
    await expect(assets.getByRfidEpc(actor, 'E2801160600000000000034A')).rejects.toMatchObject({ status: 404 });
    await expect(assets.getByRfidEpc(actor, 'E2801160600000000000034B')).resolves.toMatchObject({ id: asset.id });
    await expect(assets.create(actor, { locationId: centre.rows[0].id, name: 'Attempted recycled tag', category: 'IT', rfidEpc: 'E2801160600000000000034A' }))
      .rejects.toMatchObject({ status: 409 });

    const history = await db.query<{ epc: string; retired: boolean; retirement_reason: string | null; bound_by: string; retired_by: string | null }>(
      `SELECT epc,retired_at IS NOT NULL AS retired,retirement_reason,bound_by,retired_by
         FROM asset_rfid_bindings WHERE organization_id=$1::uuid AND asset_id=$2::uuid ORDER BY bound_at`,
      [organizationId, asset.id],
    );
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0]).toMatchObject({ epc: 'E2801160600000000000034A', retired: true, retirement_reason: 'Original tag damaged and replaced', bound_by: userId, retired_by: userId });
    expect(history.rows[1]).toMatchObject({ epc: 'E2801160600000000000034B', retired: false, retirement_reason: null, bound_by: userId, retired_by: null });
  });

  it('issues signed labels only for assets in the caller scope and resolves them tenant-safely', async () => {
    const key = generateKeyPairSync('ed25519');
    const prior = {
      kid: process.env.ASSET_QR_SIGNING_KEY_ID,
      privateKey: process.env.ASSET_QR_SIGNING_PRIVATE_KEY,
      publicKeys: process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON,
    };
    try {
      process.env.ASSET_QR_SIGNING_KEY_ID = 'phase-two-test';
      process.env.ASSET_QR_SIGNING_PRIVATE_KEY = key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      delete process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON;
      const state = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND kind='state' ORDER BY created_at LIMIT 1`, [organizationId]);
      const target = await locations.create(actor, { kind: 'centre', name: 'QR target centre', code: 'QR-TARGET', parentId: state.rows[0].id });
      const other = await locations.create(actor, { kind: 'centre', name: 'QR other centre', code: 'QR-OTHER', parentId: state.rows[0].id });
      const asset = await assets.create(actor, { locationId: target.id, name: 'Signed label test', category: 'IT' });
      const signed = await assets.signedQrForAsset(actor, asset.id);
      expect(signed.value).toMatch(/^INCU1\./);
      await expect(assets.getByQr(actor, signed.value)).resolves.toMatchObject({ id: asset.id, qrPublicId: asset.qrPublicId });

      const scopedUser = await db.query<{ id: string }>(
        `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'signed-qr-scope','Scoped User','signed-qr-scope@example.test') RETURNING id`,
        [organizationId],
      );
      await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`,
        [organizationId, scopedUser.rows[0].id, other.id]);
      const outOfScopeActor: ActorContext = {
        userId: scopedUser.rows[0].id,
        organizationId,
        subject: 'signed-qr-scope',
        memberships: [{ role: 'centre_head', scopeLocationId: other.id }],
      };
      await expect(assets.signedQrForAsset(outOfScopeActor, asset.id)).rejects.toMatchObject({ status: 403 });
      await expect(assets.getByQr({ ...actor, organizationId: '30000000-0000-4000-8000-000000000001' }, signed.value))
        .rejects.toMatchObject({ status: 400 });
    } finally {
      restoreEnv('ASSET_QR_SIGNING_KEY_ID', prior.kid);
      restoreEnv('ASSET_QR_SIGNING_PRIVATE_KEY', prior.privateKey);
      restoreEnv('ASSET_QR_VERIFY_PUBLIC_KEYS_JSON', prior.publicKeys);
    }
  });

  it('previews and imports a centre CSV atomically, with explicit state and duplicate review', async () => {
    const csv = 'Center Code,Center Name,City,State,Location Kind,Parent Center Code,Physical Address\nCSV-01,"New, Ahmedabad Centre",Ahmedabad,Gujarat,centre,,Tower 4\nCSV-02,Surat Workspace,Surat,Gujarat,centre,,\n,Floor 2,Ahmedabad,Gujarat,floor,CSV-01,\n';
    const preview = await locations.previewCentreImport(headOffice, csv);
    expect(preview).toMatchObject({ totalRows: 3, validRows: 3, invalidRows: 0, canImport: true });
    const imported = await locations.importCentres(headOffice, csv);
    expect(imported).toMatchObject({ importedCount: 2, importedLocationCount: 3 });
    expect(imported.centres[0]).toMatchObject({ code: 'CSV-01', name: 'New, Ahmedabad Centre', stateName: 'Gujarat', physicalAddress:'Tower 4', physicalAddressStatus:'unverified', coordinatesStatus:'unverified' });
    expect(imported.floors[0]).toMatchObject({ name: 'Floor 2', parentId: imported.centres[0].id });
    const duplicatePreview = await locations.previewCentreImport(headOffice, csv);
    expect(duplicatePreview).toMatchObject({ canImport: false, invalidRows: 2 });
    await expect(locations.importCentres(headOffice, csv)).rejects.toMatchObject({ status: 409 });
    const stateRows = await db.query<{ count: string }>(`SELECT count(*) FROM locations WHERE organization_id=$1 AND kind='state' AND lower(name)='gujarat'`, [organizationId]);
    expect(Number(stateRows.rows[0].count)).toBe(1);

    const viewer = await db.query<{ id: string }>(`SELECT id FROM users WHERE organization_id=$1 AND identity_subject='viewer-test'`, [organizationId]);
    const viewerActor: ActorContext = { userId: viewer.rows[0].id, organizationId, subject: 'viewer-test', memberships: [{ role: 'viewer', scopeLocationId: null }] };
    await expect(locations.previewCentreImport(viewerActor, csv)).rejects.toMatchObject({ status: 403 });
  });

  it('imports the supplied directory with shared-code floors and unknown codes left blank', async () => {
    const directoryOrganization = await db.query<{ id: string }>(
      `INSERT INTO organizations (name,slug) VALUES ('Directory import','directory-import') RETURNING id`,
    );
    const directoryUser = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'directory-test','Directory Head Office','directory@example.test') RETURNING id`,
      [directoryOrganization.rows[0].id],
    );
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key) VALUES ($1,$2,'head_office')`, [directoryOrganization.rows[0].id,directoryUser.rows[0].id]);
    const directoryActor: ActorContext = {
      userId: directoryUser.rows[0].id,
      organizationId: directoryOrganization.rows[0].id,
      subject: 'directory-test',
      memberships: [{ role: 'head_office', scopeLocationId: null }],
    };
    const csv = await readFile(new URL('../../database/seeds/incuspaze-centre-directory.csv', import.meta.url), 'utf8');
    const preview = await locations.previewCentreImport(directoryActor, csv);
    expect(preview).toMatchObject({ totalRows: 68, validRows: 68, invalidRows: 0, canImport: true });

    const imported = await locations.importCentres(directoryActor, csv);
    expect(imported).toMatchObject({ importedCount: 60, importedLocationCount: 68 });
    expect(imported.centres.filter((centre) => !centre.code)).toHaveLength(2);
    expect(imported.floors).toHaveLength(8);
    expect(imported.floors.every((floor) => imported.centres.some((centre) => centre.id === floor.parentId))).toBe(true);
    expect(imported.centres.find((centre) => centre.code === 'IKDS')?.name).toBe('iKeva Divyasree');
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
