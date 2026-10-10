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

    const coordinatesResponse=await call(`/locations/${centre.id}/coordinates`,centreToken,{latitude:12.9716,longitude:77.5946},organizationId,'PATCH');
    expect(coordinatesResponse.status).toBe(200);
    expect(((await coordinatesResponse.json()) as {coordinatesStatus:string}).coordinatesStatus).toBe('centre_head_confirmed');

    const assetResponse = await call('/assets', centreToken, { locationId: centre.id, name: 'Network switch', category: 'IT equipment', serialNumber: 'SW-1234' });
    expect(assetResponse.status).toBe(201);
    const asset = await assetResponse.json() as { id: string; assetTag: string; qrPublicId: string };
    expect(asset.assetTag).toMatch(/^INC-[0-9A-F]{12}$/);
    expect(asset.qrPublicId).toMatch(/^[0-9a-f-]{36}$/i);

    const qrResponse = await call(`/assets/qr/${asset.qrPublicId}`, centreToken);
    expect(qrResponse.status).toBe(200);
    expect(((await qrResponse.json()) as { id: string }).id).toBe(asset.id);
    const update = await call(`/assets/${asset.id}`, centreToken, { name: 'Core network switch', status: 'in_repair' }, organizationId, 'PATCH');
    expect(update.status).toBe(200);
    expect(((await update.json()) as { qrPublicId: string; name: string }).name).toBe('Core network switch');

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
    const mapResponse=await call('/insights/map',centreToken);
    expect(mapResponse.status).toBe(200);
    expect(((await mapResponse.json()) as {centres:{assetCount:number;coordinatesStatus:string}[]}).centres[0].assetCount).toBe(1);
    const overviewResponse=await call('/insights/overview',centreToken);
    expect(((await overviewResponse.json()) as {assetCount:number;attentionCount:number})).toMatchObject({assetCount:1,attentionCount:1});

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
    expect((await call(`/transfers/${transfer.id}`,hoToken,{action:'approve'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/transfers/${transfer.id}`,hoToken,{action:'dispatch'},organizationId,'PATCH')).status).toBe(200);
    expect((await call(`/transfers/${transfer.id}`,centreBToken,{action:'receive',handoverNotes:'Received and checked.'},organizationId,'PATCH')).status).toBe(200);
    expect(((await (await call('/assets',centreBToken)).json()) as {data:{id:string}[]}).data.map((row)=>row.id)).toContain(asset.id);
    expect(await (await call('/transfers',hoToken)).json()).toHaveLength(1);
    const listResponse = await call('/assets?q=SW-1234', centreToken);
    expect(((await listResponse.json()) as { data: { id: string }[] }).data).toHaveLength(0);

    const blocked = await call('/assets', centreToken, { locationId: centerBId, name: 'Out of scope switch', category: 'IT equipment' });
    expect(blocked.status).toBe(403);
    const unassignedOrg = await call('/locations', centreToken, undefined, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(unassignedOrg.status).toBe(403);

    const audit = await db.query<{ count: number | string }>(`SELECT count(*) FROM audit_events WHERE organization_id=$1`, [organizationId]);
    expect(Number(audit.rows[0].count)).toBe(17);
  });
});
