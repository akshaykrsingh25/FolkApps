import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database.service';
import { ObjectStorageService } from '../src/evidence/object-storage.service';

describe('phase two API integration', () => {
  let db: PGlite;
  let app: INestApplication;
  let server: Server;
  let baseUrl: string;
  let privateKey: CryptoKey;
  let organizationId: string;
  let headOfficeId: string;
  let centerHeadId: string;
  let centerBId: string;

  async function token(subject: string) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'phase-two-e2e' })
      .setIssuer(process.env.OIDC_ISSUER_URL!)
      .setAudience(process.env.OIDC_AUDIENCE!)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5 minutes')
      .sign(privateKey);
  }

  async function call(path: string, jwt?: string, body?: unknown, orgId = organizationId, method?: string) {
    return fetch(`${baseUrl}/api/v1${path}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {
        ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
        ...(orgId ? { 'x-organization-id': orgId } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    const migration = await readFile(new URL('../database/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const custodyMigration = await readFile(new URL('../database/migrations/002_custody_history.sql', import.meta.url), 'utf8');
    await db.exec(custodyMigration);
    const ownershipAndBatchesMigration = await readFile(new URL('../database/migrations/003_ownership_and_transfer_batches.sql', import.meta.url), 'utf8');
    await db.exec(ownershipAndBatchesMigration);
    const scopedRbacMigration = await readFile(new URL('../database/migrations/004_scoped_rbac_and_user_profiles.sql', import.meta.url), 'utf8');
    await db.exec(scopedRbacMigration);
    const dualIdentifierMigration = await readFile(new URL('../database/migrations/005_dual_asset_identifiers.sql', import.meta.url), 'utf8');
    await db.exec(dualIdentifierMigration);
    const org = await db.query<{ id: string }>(`INSERT INTO organizations (name,slug) VALUES ('E2E Org','phase-two-e2e') RETURNING id`);
    organizationId = org.rows[0].id;
    const headOffice = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'e2e-ho','Head Office','e2e-ho@example.test') RETURNING id`, [organizationId],
    );
    headOfficeId = headOffice.rows[0].id;
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key) VALUES ($1,$2,'head_office')`, [organizationId,headOfficeId]);

    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey as CryptoKey;
    const publicJwk = { ...await exportJWK(keyPair.publicKey), kid: 'phase-two-e2e', alg: 'RS256', use: 'sig' } as JWK;
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    process.env.OIDC_ISSUER_URL = `http://127.0.0.1:${address.port}/issuer`;
    process.env.OIDC_AUDIENCE = 'asset-register-test-api';
    process.env.OIDC_JWKS_URL = `http://127.0.0.1:${address.port}/jwks`;

    const query = async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
      (await db.query<Row>(sql, [...values])).rows;
    const database = {
      query,
      transaction: async <T>(work: (transactionQuery: typeof query) => Promise<T>) =>
        db.transaction(async (tx) => work(async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
          (await tx.query<Row>(sql, [...values])).rows)),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(ObjectStorageService)
      .useValue({
        createUploadUrl: async () => ({ url: 'https://private-storage.test/signed-put', headers: { 'content-type': 'image/jpeg' } }),
        verifyUpload: async () => undefined,
        createDownloadUrl: async () => 'https://private-storage.test/signed-get',
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const httpAddress = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${httpAddress.port}`;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await db?.close();
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_AUDIENCE;
    delete process.env.OIDC_JWKS_URL;
  });

  it('authenticates, provisions locations, creates/searches assets, issues QR, and enforces centre scope', async () => {
    expect((await call('/locations')).status).toBe(401);
    const hoToken = await token('e2e-ho');
    const invalid = await call('/assets', hoToken, { name: 'Missing fields' });
    expect(invalid.status).toBe(400);

    const stateResponse = await call('/locations', hoToken, { kind: 'state', name: 'Karnataka' });
    expect(stateResponse.status).toBe(201);
    const state = await stateResponse.json() as { id: string };
    const centreResponse = await call('/locations', hoToken, { kind: 'centre', name: 'Bangalore Qube', code: 'BLQS', parentId: state.id, city: 'Bangalore', stateName: 'Karnataka' });
    expect(centreResponse.status).toBe(201);
    const centre = await centreResponse.json() as { id: string };
    const otherCentreResponse = await call('/locations', hoToken, { kind: 'centre', name: 'Bangalore UB City', code: 'BLUB', parentId: state.id });
    expect(otherCentreResponse.status).toBe(201);
    centerBId = ((await otherCentreResponse.json()) as { id: string }).id;
    const centerHeadB = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'e2e-centre-b','Centre Head B','e2e-centre-b@example.test') RETURNING id`, [organizationId],
    );
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId,centerHeadB.rows[0].id,centerBId]);
    const centreBToken=await token('e2e-centre-b');

    const centerHead = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'e2e-centre','Centre Head','e2e-centre@example.test') RETURNING id`, [organizationId],
    );
    centerHeadId = centerHead.rows[0].id;
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId,centerHeadId,centre.id]);
    const centreToken = await token('e2e-centre');
    const floorResponse=await call('/locations',centreToken,{kind:'floor',name:'Floor 4',parentId:centre.id});
    expect(floorResponse.status).toBe(201);
    const floor=await floorResponse.json() as {id:string};

    const coordinatesResponse=await call(`/locations/${centre.id}/coordinates`,centreToken,{latitude:12.9716,longitude:77.5946},organizationId,'PATCH');
    expect(coordinatesResponse.status).toBe(200);
    expect(((await coordinatesResponse.json()) as {coordinatesStatus:string}).coordinatesStatus).toBe('centre_head_confirmed');

    const assetResponse = await call('/assets', centreToken, { locationId: floor.id, name: 'Network switch', category: 'IT equipment', serialNumber: 'SW-1234', ownershipType:'CLIENT_DEDICATED', rfidEpc:'E2801160600000000000034A' });
    expect(assetResponse.status).toBe(201);
    const asset = await assetResponse.json() as { id: string; assetTag: string; qrPublicId: string; ownershipType:string; rfidEpc:string };
    expect(asset.assetTag).toMatch(/^INC-[0-9A-F]{12}$/);
    expect(asset.qrPublicId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(asset.ownershipType).toBe('CLIENT_DEDICATED');
    expect(asset.rfidEpc).toBe('E2801160600000000000034A');

    const otherCentreAssetResponse=await call('/assets',centreBToken,{locationId:centerBId,name:'Remote access point',category:'IT equipment',serialNumber:'AP-9876',rfidEpc:'E2801160600000000000034B'});
    expect(otherCentreAssetResponse.status).toBe(201);
    const otherCentreAsset=await otherCentreAssetResponse.json() as {id:string;rfidEpc:string};
    expect(otherCentreAsset.rfidEpc).toBe('E2801160600000000000034B');
    expect((await call(`/assets/rfid/${otherCentreAsset.rfidEpc}`,centreToken)).status).toBe(403);

    const qrResponse = await call(`/assets/qr/${asset.qrPublicId}`, centreToken);
    expect(qrResponse.status).toBe(200);
    expect(((await qrResponse.json()) as { id: string }).id).toBe(asset.id);
    const update = await call(`/assets/${asset.id}`, centreToken, { name: 'Core network switch', status: 'in_repair' }, organizationId, 'PATCH');
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({qrPublicId:asset.qrPublicId,name:'Core network switch',ownershipType:'CLIENT_DEDICATED',rfidEpc:asset.rfidEpc});
    expect((await call(`/assets/${asset.id}`,centreToken,{ownershipType:'VENDOR_LEASED'},organizationId,'PATCH')).status).toBe(403);
    expect(await (await call(`/assets/${asset.id}`,hoToken,{ownershipType:'VENDOR_LEASED'},organizationId,'PATCH')).json()).toMatchObject({ownershipType:'VENDOR_LEASED'});

    const uploadResponse = await call(`/assets/${asset.id}/evidence/upload-url`, centreToken, {
      clientEvidenceId: '60000000-0000-4000-8000-000000000001', kind: 'asset_photo', originalName: 'switch.jpg', contentType: 'image/jpeg', byteSize: 5, sha256: 'a'.repeat(64),
    });
    expect(uploadResponse.status).toBe(201);
    const upload = await uploadResponse.json() as { evidenceId: string; uploadUrl: string };
    expect(upload.uploadUrl).toContain('private-storage.test');
    const completedEvidence = await call(`/assets/${asset.id}/evidence/complete`, centreToken, { evidenceId: upload.evidenceId });
    expect(completedEvidence.status).toBe(201);
    expect(((await completedEvidence.json()) as { kind: string }).kind).toBe('asset_photo');
    const retryUpload = await call(`/assets/${asset.id}/evidence/upload-url`, centreToken, {
      clientEvidenceId: '60000000-0000-4000-8000-000000000001', kind: 'asset_photo', originalName: 'switch.jpg', contentType: 'image/jpeg', byteSize: 5, sha256: 'a'.repeat(64),
    });
    expect(((await retryUpload.json()) as { alreadyCompleted: boolean }).alreadyCompleted).toBe(true);
    expect(await (await call(`/assets/${asset.id}/evidence`, centreToken)).json()).toHaveLength(1);
    expect(((await (await call(`/assets/${asset.id}/evidence/${upload.evidenceId}/download`, centreToken)).json()) as { downloadUrl: string }).downloadUrl)
      .toContain('signed-get');

    const policyResponse=await call('/verification/policies',hoToken,{scopeLocationId:state.id,cadenceMonths:6,graceDays:60});
    expect(policyResponse.status).toBe(201);
    const policy=await policyResponse.json() as {id:string;cadenceMonths:number;graceDays:number};
    expect(policy).toMatchObject({cadenceMonths:6,graceDays:60});
    expect((await call('/verification/policies',centreToken,{scopeLocationId:centre.id,cadenceMonths:6,graceDays:60})).status).toBe(403);
    const cycleResponse=await call('/verification/cycles',hoToken,{policyId:policy.id});
    expect(cycleResponse.status).toBe(201);
    const cycle=await cycleResponse.json() as {id:string};
    const emptyProgressResponse=await call(`/verification/cycles/${cycle.id}/progress`,centreToken);
    expect(emptyProgressResponse.status).toBe(200);
    const emptyProgress=await emptyProgressResponse.json() as {reviewState:string}[];
    expect(emptyProgress).toHaveLength(1);
    expect(emptyProgress[0].reviewState).toBe('not_yet_scanned');
    const eventId='70000000-0000-4000-8000-000000000001';
    const scanBody={assetId:asset.id,locationId:centre.id,clientEventId:eventId,scannedAt:new Date().toISOString()};
    expect((await call(`/verification/cycles/${cycle.id}/scans`,centreToken,{...scanBody,locationId:centerBId})).status).toBe(403);
    expect((await call(`/verification/cycles/${cycle.id}/scans`,centreToken,scanBody)).status).toBe(201);
    expect(((await (await call(`/verification/cycles/${cycle.id}/scans`,centreToken,scanBody)).json()) as {duplicate:boolean}).duplicate).toBe(true);
    const verifiedProgress=await (await call(`/verification/cycles/${cycle.id}/progress`,centreToken)).json() as {reviewState:string;scanned:boolean}[];
    expect(verifiedProgress[0]).toMatchObject({scanned:true,reviewState:'verified'});
    expect(((await (await call('/verification/cycles',centreToken)).json()) as {assetCount:number;scannedCount:number}[])[0]).toMatchObject({assetCount:1,scannedCount:1});

    const viewer=await db.query<{id:string}>(`INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'e2e-viewer','Read Only Viewer','e2e-viewer@example.test') RETURNING id`,[organizationId]);
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'viewer',$3)`,[organizationId,viewer.rows[0].id,centre.id]);
    const viewerToken=await token('e2e-viewer');
    expect((await call('/assets',viewerToken)).status).toBe(200);
    expect((await call('/assets',viewerToken,{locationId:centre.id,name:'Viewer write must fail',category:'IT'})).status).toBe(403);
    expect((await call(`/verification/cycles/${cycle.id}/scans`,viewerToken,{...scanBody,clientEventId:'70000000-0000-4000-8000-000000000002'})).status).toBe(403);

    const managedUserResponse=await call('/users',centreToken,{identitySubject:'e2e-custodian',email:'e2e-custodian@example.test',displayName:'Centre Custodian',role:'asset_custodian',scopeLocationId:floor.id});
    expect(managedUserResponse.status).toBe(201);
    const managedUser=await managedUserResponse.json() as {id:string;isActive:boolean;role:string;passwordHash?:string};
    expect(managedUser).toMatchObject({isActive:true,role:'asset_custodian'});
    expect(managedUser).not.toHaveProperty('passwordHash');
    const custodianToken=await token('e2e-custodian');
    expect(((await (await call('/users',centreToken)).json()) as {id:string}[]).map((row)=>row.id)).toContain(managedUser.id);
    expect((await call('/users',custodianToken)).status).toBe(403);
    expect((await call(`/users/${managedUser.id}/active`,centreBToken,{isActive:false},organizationId,'PATCH')).status).toBe(403);
    expect((await call(`/users/${managedUser.id}/active`,centreToken,{isActive:false},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/users/${managedUser.id}/active`,centreToken,{isActive:true},organizationId,'PATCH')).status).toBe(200);
    const rfidEvent='70000000-0000-4000-8000-000000000010';
    const rfidBatch={locationId:floor.id,readings:[
      {epc:asset.rfidEpc,clientEventId:rfidEvent,scannedAt:new Date().toISOString()},
      {epc:otherCentreAsset.rfidEpc,clientEventId:'70000000-0000-4000-8000-000000000011',scannedAt:new Date().toISOString()},
      {epc:'E2801160600000000000034C',clientEventId:'70000000-0000-4000-8000-000000000012',scannedAt:new Date().toISOString()},
      {epc:asset.rfidEpc,clientEventId:'70000000-0000-4000-8000-000000000013',scannedAt:new Date().toISOString()},
    ]};
    const rfidResponse=await call(`/verification/cycles/${cycle.id}/rfid-scans`,custodianToken,rfidBatch);
    expect(rfidResponse.status).toBe(201);
    expect(await rfidResponse.json()).toMatchObject({receivedCount:4,recordedCount:1,duplicateCount:1,wrongLocationCount:0,notRegisteredCount:2,
      results:[{epc:asset.rfidEpc,status:'recorded',assetId:asset.id},{epc:otherCentreAsset.rfidEpc,status:'not_registered'},{epc:'E2801160600000000000034C',status:'not_registered'},{epc:asset.rfidEpc,status:'duplicate_read'}]});
    expect((await db.query<{identification_method:string;asset_id:string}>(`SELECT identification_method,asset_id FROM scan_events WHERE organization_id=$1 AND client_event_id=$2`,[organizationId,rfidEvent])).rows[0]).toMatchObject({identification_method:'rfid',asset_id:asset.id});
    const repeatedRfid=await call(`/verification/cycles/${cycle.id}/rfid-scans`,custodianToken,rfidBatch);
    expect(await repeatedRfid.json()).toMatchObject({recordedCount:0,duplicateCount:2,notRegisteredCount:2,
      results:[{epc:asset.rfidEpc,status:'duplicate'},{epc:otherCentreAsset.rfidEpc,status:'not_registered'},{epc:'E2801160600000000000034C',status:'not_registered'},{epc:asset.rfidEpc,status:'duplicate_read'}]});
    expect((await call(`/verification/cycles/${cycle.id}/rfid-scans`,centreToken,{locationId:centre.id,readings:[{epc:asset.rfidEpc,clientEventId:rfidEvent,scannedAt:new Date().toISOString()}]})).status).toBe(409);
    const privateProgress=await call(`/verification/cycles/${cycle.id}/progress`,custodianToken);
    expect(await privateProgress.json()).toMatchObject([{assetId:asset.id,scanned:true,reviewState:'verified'}]);
    expect(((await (await call('/verification/cycles',custodianToken)).json()) as {assetCount:number;scannedCount:number}[])[0]).toMatchObject({assetCount:1,scannedCount:1});
    const custodian={rows:[{id:managedUser.id}]};
    const peopleResponse=await call(`/assets/${asset.id}/custodians`,centreToken);
    expect(peopleResponse.status).toBe(200);
    expect(await peopleResponse.json()).toEqual([{userId:custodian.rows[0].id,displayName:'Centre Custodian'}]);
    const issueResponse=await call(`/assets/${asset.id}/custody`,centreToken,{custodianUserId:custodian.rows[0].id,condition:'good',notes:'Issued with power adapter.'});
    expect(issueResponse.status).toBe(201);
    const issued=await issueResponse.json() as {custodyId:string};
    expect((await call(`/assets/${asset.id}/custody`,centreToken)).status).toBe(200);
    expect((await call(`/assets/${asset.id}/custody`,centreToken,{custodianUserId:custodian.rows[0].id},organizationId,'POST')).status).toBe(409);
    const returnResponse=await call(`/assets/${asset.id}/custody/${issued.custodyId}/return`,centreToken,{condition:'fair',notes:'Returned with light casing wear.'});
    expect(returnResponse.status).toBe(201);
    const custodyRows=await call(`/assets/${asset.id}/custody`,centreToken);
    expect(await custodyRows.json()).toMatchObject([{custodianName:'Centre Custodian',issueCondition:'good',returnCondition:'fair',returnedByName:'Centre Head'}]);
    const activityResponse=await call(`/assets/${asset.id}/activity`,centreToken);
    expect(activityResponse.status).toBe(200);
    expect(((await activityResponse.json()) as {eventType:string}[]).map((event)=>event.eventType)).toEqual(expect.arrayContaining(['verification.asset_scanned','custody.issued','custody.returned']));

    const mapResponse=await call('/insights/map',centreToken);
    expect(mapResponse.status).toBe(200);
    const scopedMap=await mapResponse.json() as {states:{stateName:string;centreCount:number;assetCount:number}[];centres:{assetCount:number;coordinatesStatus:string;stateName:string}[]};
    expect(scopedMap.centres).toHaveLength(1);
    expect(scopedMap.centres[0]).toMatchObject({assetCount:1,coordinatesStatus:'centre_head_confirmed',stateName:'Karnataka'});
    expect(scopedMap.states).toEqual([{stateName:'Karnataka',centreCount:1,assetCount:1,missingCount:0,attentionCount:1,unusedCount:0}]);
    const overviewResponse=await call('/insights/overview',centreToken);
    expect(((await overviewResponse.json()) as {assetCount:number;centreCount:number;attentionCount:number;activeCycleCount:number;scanCompletionPercent:number})).toMatchObject({assetCount:1,centreCount:1,attentionCount:1,activeCycleCount:1,scanCompletionPercent:100});

    const reportResponse=await call('/reports',centreToken,{assetId:asset.id,kind:'needs_repair',urgency:'high',description:'Network switch port is intermittently dropping traffic.'});
    expect(reportResponse.status).toBe(201);
    const report=await reportResponse.json() as {id:string;status:string}; expect(report.status).toBe('reported');
    expect(await (await call('/reports',centreToken)).json()).toHaveLength(1);
    expect((await call(`/reports/${report.id}`,centreToken,{status:'in_repair',resolutionNotes:'Technician assigned; spare unit ordered.'},organizationId,'PATCH')).status).toBe(200);
    await expect((await call('/reports',centreBToken)).json()).resolves.toHaveLength(0);
    const warrantyResponse=await call(`/assets/${asset.id}/warranties`,centreToken,{coverageKind:'warranty',provider:'Cisco',servicePhone:'+91 80000 12345',startsOn:'2026-01-01',endsOn:'2027-01-01'});
    expect(warrantyResponse.status).toBe(201);
    expect(((await warrantyResponse.json()) as {coverageKind:string;endsOn:string}).coverageKind).toBe('warranty');
    expect(await (await call(`/assets/${asset.id}/warranties`,centreToken)).json()).toHaveLength(1);

    const transferResponse=await call('/transfers',hoToken,{assetId:asset.id,toLocationId:centerBId,handoverNotes:'Move spare switch to UB City IT store.'});
    expect(transferResponse.status).toBe(201);
    const transfer=await transferResponse.json() as {id:string};
    expect((await call(`/transfers/${transfer.id}`,hoToken,{action:'approve'},organizationId,'PATCH')).status).toBe(409);
    expect((await call(`/transfers/${transfer.id}`,centreToken,{action:'approve'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/transfers/${transfer.id}`,hoToken,{action:'dispatch'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/transfers/${transfer.id}`,centreBToken,{action:'receive',handoverNotes:'Received and checked.'},organizationId,'PATCH')).status).toBe(200);
    const destinationTransfers=await (await call('/transfers',centreBToken)).json() as {fromLocationName:string;toLocationName:string}[];
    expect(destinationTransfers).toHaveLength(1);
    expect(destinationTransfers[0]).toMatchObject({fromLocationName:'Outside your assigned scope',toLocationName:'Bangalore UB City'});
    expect(((await (await call('/assets',centreBToken)).json()) as {data:{id:string}[]}).data.map((row)=>row.id)).toContain(asset.id);
    expect(await (await call('/transfers',hoToken)).json()).toHaveLength(1);

    const batchAssetA=await call('/assets',centreToken,{locationId:centre.id,name:'Meeting-room display',category:'AV',ownershipType:'INCUSPAZE_OWNED'});
    const batchAssetB=await call('/assets',centreToken,{locationId:centre.id,name:'Conference camera',category:'AV'});
    const batchAssetC=await call('/assets',centreToken,{locationId:centre.id,name:'Room speaker',category:'AV'});
    const batchA=await batchAssetA.json() as {id:string}; const batchB=await batchAssetB.json() as {id:string}; const batchC=await batchAssetC.json() as {id:string};
    const batchCreated=await call('/transfer-batches',hoToken,{assetIds:[batchA.id,batchB.id,batchC.id],toLocationId:centerBId,handoverNotes:'Move AV equipment to the Bangalore centre.'});
    expect(batchCreated.status).toBe(201);
    const batch=await batchCreated.json() as {id:string;batchReference:string;itemCount:number};
    expect(batch).toMatchObject({itemCount:3});
    expect(batch.batchReference).toMatch(/^BT-[A-F0-9]{20}$/);
    expect((await call('/transfer-batches',centreBToken,{assetIds:[batchA.id],toLocationId:centerBId},organizationId,'POST')).status).toBe(403);
    expect((await call(`/transfer-batches/${batch.id}`,hoToken,{action:'approve'},organizationId,'PATCH')).status).toBe(409);
    expect((await call(`/transfer-batches/${batch.id}`,centreToken,{action:'approve'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/transfer-batches/${batch.id}`,hoToken,{action:'dispatch'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/assets/${batchA.id}`,hoToken,{locationId:centerBId},organizationId,'PATCH')).status).toBe(409);
    expect((await call(`/assets/${batchA.id}`,hoToken,{status:'missing',statusChangeReason:'Cannot mark while in transit'},organizationId,'PATCH')).status).toBe(409);
    expect((await call(`/transfer-batches/${batch.id}`,centreToken,{action:'receive',items:[]},organizationId,'PATCH')).status).toBe(403);
    await db.query(`UPDATE transfer_batches SET auto_flag_after=now()-interval '1 second' WHERE organization_id=$1 AND id=$2`,[organizationId,batch.id]);
    const batchWatch=await (await call('/insights/alerts',centreToken)).json() as {kind:string;relatedId:string|null}[];
    expect(batchWatch.some(alert=>alert.kind==='transfer_stalled'&&alert.relatedId===batch.id)).toBe(true);
    const batchReceive=await call(`/transfer-batches/${batch.id}`,centreBToken,{action:'receive',items:[
      {assetId:batchA.id,receiptStatus:'accepted'},
      {assetId:batchB.id,receiptStatus:'not_received',discrepancyNote:'Item was not present in the sealed shipment.'},
      {assetId:batchC.id,receiptStatus:'damaged',discrepancyNote:'Outer casing cracked during transport.'},
    ]},organizationId,'PATCH');
    expect(batchReceive.status).toBe(200);
    expect(await batchReceive.json()).toMatchObject({status:'received_with_discrepancy'});
    const destinationBatchList=await (await call('/transfer-batches',centreBToken)).json() as {batchReference:string;fromLocationName:string;toLocationName:string;items:{assetId:string;receiptStatus:string}[]}[];
    expect(destinationBatchList[0]).toMatchObject({batchReference:batch.batchReference,fromLocationName:'Outside your assigned scope',toLocationName:'Bangalore UB City'});
    expect(destinationBatchList[0].items).toEqual(expect.arrayContaining([
      expect.objectContaining({assetId:batchA.id,receiptStatus:'accepted'}),expect.objectContaining({assetId:batchB.id,receiptStatus:'not_received'}),
      expect.objectContaining({assetId:batchC.id,receiptStatus:'damaged'}),
    ]));
    expect(((await (await call('/assets',centreBToken)).json()) as {data:{id:string}[]}).data.map(row=>row.id)).toContain(batchA.id);
    expect(((await (await call('/assets',centreBToken)).json()) as {data:{id:string;condition:string}[]}).data.find(row=>row.id===batchC.id)?.condition).toBe('damaged');
    expect(((await (await call('/assets',centreToken)).json()) as {data:{id:string}[]}).data.map(row=>row.id)).toContain(batchB.id);
    expect(((await (await call('/reports',centreBToken)).json()) as {kind:string}[]).some(report=>report.kind==='damaged')).toBe(true);
    const discrepancyAlerts=await (await call('/insights/alerts',centreToken)).json() as {kind:string;assetId:string}[];
    expect(discrepancyAlerts.some(alert=>alert.kind==='transfer_discrepancy'&&alert.assetId===batchB.id)).toBe(true);
    expect((await call('/transfers',hoToken,{assetId:batchB.id,toLocationId:centerBId},organizationId,'POST')).status).toBe(409);
    await db.query(`INSERT INTO scan_events (organization_id,asset_id,location_id,client_event_id,scanned_at) VALUES ($1,$2,$3,'f0000000-0000-4000-8000-000000000001',now()+interval '1 second')`,[organizationId,batchB.id,centre.id]);
    const clearedDiscrepancyAlerts=await (await call('/insights/alerts',centreToken)).json() as {kind:string;assetId:string}[];
    expect(clearedDiscrepancyAlerts.some(alert=>alert.kind==='transfer_discrepancy'&&alert.assetId===batchB.id)).toBe(false);
    expect((await call('/transfers',hoToken,{assetId:batchB.id,toLocationId:centerBId},organizationId,'POST')).status).toBe(201);

    const listResponse = await call('/assets?q=SW-1234', centreToken);
    expect(((await listResponse.json()) as { data: { id: string }[] }).data).toHaveLength(0);

    const duplicateOne=await call('/assets',centreToken,{locationId:centre.id,name:'Duplicate router one',category:'IT equipment',serialNumber:'DUP-777'});
    const duplicateTwo=await call('/assets',centreToken,{locationId:centre.id,name:'Duplicate router two',category:'IT equipment',serialNumber:'DUP-777'});
    expect(duplicateOne.status).toBe(201);expect(duplicateTwo.status).toBe(201);
    const duplicateAsset=await duplicateOne.json() as {id:string};
    expect((await call(`/assets/${duplicateAsset.id}`,centreToken,{status:'missing'},organizationId,'PATCH')).status).toBe(409);
    expect((await call(`/assets/${duplicateAsset.id}`,centreToken,{status:'disposed',statusChangeReason:'Written off'},organizationId,'PATCH')).status).toBe(403);
    expect((await call(`/assets/${duplicateAsset.id}`,centreToken,{status:'missing',statusChangeReason:'Checked with centre head; item not located.'},organizationId,'PATCH')).status).toBe(200);
    await db.query(`INSERT INTO verification_cycles (organization_id,scope_location_id,starts_at,grace_ends_at,status,created_by) VALUES ($1,$2,now()-interval '70 days',now()-interval '10 days','open',$3)`,[organizationId,centre.id,headOfficeId]);
    const alertsResponse=await call('/insights/alerts',centreToken);
    expect(alertsResponse.status).toBe(200);
    const alerts=await alertsResponse.json() as {kind:string;description:string}[];
    expect(alerts.map((alert)=>alert.kind)).toEqual(expect.arrayContaining(['missing','duplicate_serial','verification_overdue']));
    expect(alerts.filter((alert)=>alert.kind==='verification_overdue').every((alert)=>alert.description.includes('not a confirmed loss'))).toBe(true);
    expect(await (await call('/insights/alerts',centreBToken)).json()).toHaveLength(0);

    const blocked = await call('/assets', centreToken, { locationId: centerBId, name: 'Out of scope switch', category: 'IT equipment' });
    expect(blocked.status).toBe(403);
    const unassignedOrg = await call('/locations', centreToken, undefined, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(unassignedOrg.status).toBe(403);

    const directoryCsv='Center Code,Center Name,City,State\nE2E-01,First Pilot Centre,Jaipur,Rajasthan\nE2E-02,Second Pilot Centre,Udaipur,Rajasthan\n';
    expect((await call('/locations/import/preview',centreToken,{csv:directoryCsv})).status).toBe(403);
    const directoryPreview=await call('/locations/import/preview',hoToken,{csv:directoryCsv});
    expect(directoryPreview.status).toBe(201);
    expect(await directoryPreview.json()).toMatchObject({totalRows:2,validRows:2,invalidRows:0,canImport:true});
    const directoryImport=await call('/locations/import',hoToken,{csv:directoryCsv});
    expect(directoryImport.status).toBe(201);
    expect(await directoryImport.json()).toMatchObject({importedCount:2});
    expect((await call('/locations/import/preview',hoToken,{csv:directoryCsv})).status).toBe(201);
    expect(await (await call('/locations/import/preview',hoToken,{csv:directoryCsv})).json()).toMatchObject({canImport:false,invalidRows:2});

    const audit = await db.query<{event_type:string;count:number|string}>(`SELECT event_type,count(*) FROM audit_events WHERE organization_id=$1 GROUP BY event_type`, [organizationId]);
    const auditCounts=Object.fromEntries(audit.rows.map(row=>[row.event_type,Number(row.count)]));
    expect(auditCounts['transfer_batch.requested']).toBe(1);
    expect(auditCounts['transfer_batch.receive']).toBe(1);
    expect(auditCounts['transfer_batch.item_discrepancy']).toBe(2);
    expect(auditCounts['condition.reported']).toBeGreaterThanOrEqual(2);
  });
});
