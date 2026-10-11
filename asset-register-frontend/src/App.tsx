import { registerCopies, type RegistrationBatch, similarAssetSeed, locationPath, missingAssetDetails, rememberedLocation, rememberLocation, type RegistrationSeed } from './capture/quickAdd';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from 'oidc-client-ts';
import QRCode from 'qrcode';
import { api, ApiError } from './api/client';
import { oidcConfigured, userManager } from './auth/oidc';
import { saveDemoEvidence, listDemoEvidence, readDemoEvidence } from './demo/evidence';
import { demoStore, DEMO_ORGANIZATION } from './demo/store';
import type { Asset, AssetActivityEvent, AssetCustody, AssetExportJob, AuditEvent, Evidence, EligibleCustodian, Location, LocationKind, ManagedUser, NotificationCategory, NotificationPreference, OperationalAlert, Organization, Role, RfidScanReconcileResult, SessionUser, UserNotification, VerificationAsset, VerificationCycle, VerificationPolicy, LifecycleReport, AssetTransfer, TransferBatch, WarrantyRecord, InsightOverview, IndiaMapData, MapCentre } from './domain/types';
import { isWithinIndia, parseLatitudeLongitude } from './domain/coordinates';
import { findTransferReceiptAsset, validateTransferReceiptScans } from './domain/transferReceipt';
import { isSignedAssetQr, qrIdentityForOfflineLookup, verifySignedAssetQr } from './domain/signedQr';
import { Icon } from './ui/Icon';
import { CodeScanner } from './capture/CodeScanner';
import { extractInvoiceSuggestions, readImageText, type CaptureSuggestions } from './capture/ocr';
import { createVisualHash } from './capture/visualMatch';
import { isPhotoClassifierCached, preparePhotoClassifier, suggestAssetFromPhoto } from './capture/photoClassifier';
import { parseRfidBatchText } from './capture/rfidBatch';
import { enqueueOfflineAsset, enqueueVerificationScan, listOfflineAssets, listVerificationScans, markOfflineAssetError, markVerificationScanError, removeOfflineAsset, removeOfflineAssetAttachment, removeVerificationScan, type OfflineAssetDraft, type PendingAttachment, type PendingCapture, type PendingVerificationScan } from './capture/offlineQueue';

type View = 'home' | 'alerts' | 'notifications' | 'audit' | 'map' | 'locations' | 'assets' | 'exports' | 'verify' | 'reports' | 'transfers' | 'users' | 'asset-form' | 'asset-detail' | 'qr-label' | 'scanner';
type RfidBatchSummary = Omit<RfidScanReconcileResult,'results'> & { inputDuplicateCount:number; results:RfidScanReconcileResult['results'] };
const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';
const NOTIFICATION_CATEGORIES: { id: NotificationCategory; title: string; detail: string }[] = [
  { id: 'missing', title: 'Missing assets', detail: 'Items not found during a verification window' },
  { id: 'verification', title: 'Verification cycles', detail: 'Scan windows, progress, and overdue checks' },
  { id: 'transfers', title: 'Transfers', detail: 'Dispatches, receipts, and movement delays' },
  { id: 'repairs', title: 'Repairs & condition', detail: 'Damage reports and repair updates' },
  { id: 'data_quality', title: 'Register quality', detail: 'Duplicate serials and record conflicts' },
];
const AUDIT_EVENT_TYPES = [
  'asset.created', 'asset.updated', 'asset.rfid_binding_changed', 'verification.asset_scanned',
  'condition.reported', 'condition.status_changed', 'transfer.requested', 'transfer.approve',
  'transfer.dispatch', 'transfer.receive', 'transfer.reject', 'transfer.cancel',
  'transfer_batch.requested', 'transfer_batch.approve', 'transfer_batch.dispatch', 'transfer_batch.receive',
  'transfer_batch.reject', 'transfer_batch.cancel', 'transfer_batch.item_discrepancy',
  'custody.issued', 'custody.returned', 'warranty.recorded', 'verification.cycle_opened',
  'verification.cycle_closed', 'verification.cycle_auto_opened', 'verification.escalation_notified',
  'verification.policy_created', 'verification.policy_updated',
  'location.coordinates_confirmed',
];
const KINDS: LocationKind[] = ['state', 'centre', 'warehouse', 'building', 'floor', 'area'];
const PARENT_KINDS: Record<LocationKind, LocationKind[]> = {
  state: [], centre: ['state'], warehouse: ['state'], building: ['centre', 'warehouse'], floor: ['centre', 'building'], area: ['floor'],
};

type MapFeature={type:'Feature';properties:{name:string};geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][][]|number[][][]}};
type IndiaGeoJson={type:'FeatureCollection';features:MapFeature[]};
const MAP_WIDTH=760,MAP_HEIGHT=580,MAP_PAD=16;
function mapBounds(features:MapFeature[]) {
  const points:number[][]=[];
  const visit=(node:unknown):void=>{if(Array.isArray(node)&&typeof node[0]==='number')points.push(node as number[]);else if(Array.isArray(node))node.forEach(visit);};
  features.forEach((feature)=>visit(feature.geometry.coordinates));
  return {minX:Math.min(...points.map((point)=>point[0])),maxX:Math.max(...points.map((point)=>point[0])),minY:Math.min(...points.map((point)=>point[1])),maxY:Math.max(...points.map((point)=>point[1]))};
}
function mapProject(longitude:number,latitude:number,bounds:ReturnType<typeof mapBounds>) {
  const scale=Math.min((MAP_WIDTH-MAP_PAD*2)/(bounds.maxX-bounds.minX),(MAP_HEIGHT-MAP_PAD*2)/(bounds.maxY-bounds.minY));
  const width=(bounds.maxX-bounds.minX)*scale,height=(bounds.maxY-bounds.minY)*scale;
  const offsetX=(MAP_WIDTH-width)/2,offsetY=(MAP_HEIGHT-height)/2;
  return [offsetX+(longitude-bounds.minX)*scale,offsetY+(bounds.maxY-latitude)*scale] as const;
}
function featurePath(feature:MapFeature,bounds:ReturnType<typeof mapBounds>) {
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];
  return polygons.flatMap((polygon)=>polygon.map((ring)=>ring.map((point,index)=>{const [x,y]=mapProject(point[0],point[1],bounds);return `${index?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ')+' Z')).join(' ');
}
function stateKey(value:string) { const normalized=value.toLowerCase().replaceAll('&','and').replace(/[^a-z]/g,''); return ({orissa:'odisha',uttaranchal:'uttarakhand',pondicherry:'puducherry'} as Record<string,string>)[normalized]||normalized; }
function isWithinLocation(locations:Location[],childId:string,ancestorId:string) { let current=locations.find((item)=>item.id===childId); while(current){if(current.id===ancestorId)return true;current=locations.find((item)=>item.id===current?.parentId);}return false; }
function isRfidEpc(value:string) { return /^(?:[A-Fa-f0-9]{2}){4,32}$/.test(value.trim()); }
function formatBytes(value:number) { return value<1024?`${value} B`:value<1024*1024?`${(value/1024).toFixed(1)} KB`:`${(value/(1024*1024)).toFixed(1)} MB`; }
function exportFailureMessage(code:string|null) {
  if(code==='access_revoked')return 'Access changed while this export was being prepared. Ask an administrator to check your scope.';
  if(code==='row_limit_exceeded'||code==='file_limit_exceeded')return 'This export is too large. Choose a smaller location or add a filter.';
  if(code==='retry_limit')return 'The worker could not prepare this file after several attempts. Try again later.';
  return 'The file could not be prepared. Try again later or contact support.';
}

function sessionUser(user: User): SessionUser {
  return {
    subject: user.profile.sub,
    name: String(user.profile.name || user.profile.preferred_username || 'Team'),
    email: String(user.profile.email || user.profile.preferred_username || ''),
    accessToken: user.access_token,
  };
}

function readForm(form: HTMLFormElement): Record<string, unknown> {
  const entries = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(entries)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => [key, key === 'purchaseAmount' ? Number(value) : value]));
}

function activityTitle(eventType:string) {
  const titles:Record<string,string>={
    'asset.created':'Asset added to the register','asset.updated':'Asset record updated','verification.asset_scanned':'Verification scan recorded',
    'condition.reported':'Condition report raised','condition.status_changed':'Report status changed','transfer.requested':'Transfer requested',
    'transfer.approve':'Transfer approved','transfer.dispatch':'Transfer marked in transit','transfer.receive':'Transfer received',
    'transfer.reject':'Transfer request declined','transfer.cancel':'Transfer cancelled','custody.issued':'Issued to a custodian',
    'transfer_batch.requested':'Transfer manifest created','transfer_batch.approve':'Manifest approved','transfer_batch.dispatch':'Manifest dispatched',
    'transfer_batch.receive':'Manifest receipt recorded','transfer_batch.reject':'Manifest declined','transfer_batch.cancel':'Manifest cancelled',
    'transfer_batch.item_discrepancy':'Transfer receipt discrepancy',
    'custody.returned':'Custody returned','warranty.recorded':'Coverage recorded','asset.rfid_binding_changed':'RFID tag bound or replaced',
    'verification.cycle_opened':'Verification cycle opened','verification.cycle_closed':'Verification cycle closed',
    'verification.cycle_auto_opened':'Recurring verification cycle opened','verification.escalation_notified':'Verification cycle escalated',
    'verification.policy_created':'Verification schedule created','verification.policy_updated':'Verification schedule updated',
    'location.coordinates_confirmed':'Centre location details confirmed',
  };
  return titles[eventType]||eventType.replaceAll('.',' · ').replaceAll('_',' ');
}

function activitySummary(event:AssetActivityEvent) {
  const details=event.details||{};
  if(event.eventType==='asset.updated'&&details.changes&&typeof details.changes==='object'){
    const changes=details.changes as Record<string,{before?:unknown;after?:unknown}>;
    const fieldSummary=Object.entries(changes).map(([field,change])=>`${field.replace(/[A-Z]/g,(letter)=>` ${letter.toLowerCase()}`)}: ${String(change.before??'—')} → ${String(change.after??'—')}`).join(' · ');
    return [fieldSummary,details.statusChangeReason?`Reason: ${String(details.statusChangeReason)}`:''].filter(Boolean).join(' · ')||'Record reviewed; no field differences recorded.';
  }
  if(event.eventType.startsWith('custody.'))return `${String(details.custodianName||'Custodian')} · ${String(details.condition||'condition not recorded').replaceAll('_',' ')}${details.locationName?` · ${String(details.locationName)}`:''}`;
  if(event.eventType==='condition.status_changed')return `${String(details.from||'previous status').replaceAll('_',' ')} → ${String(details.to||'updated').replaceAll('_',' ')}`;
  if(event.eventType==='asset.rfid_binding_changed')return `${details.previousEpc?'Previous tag retired':'First tag bound'}${details.nextEpc?` · current EPC ${String(details.nextEpc)}`:' · no current EPC'}${details.reason?` · Reason: ${String(details.reason)}`:''}`;
  if(event.eventType==='transfer_batch.item_discrepancy')return `Receipt marked ${String(details.receiptStatus||'needs review').replaceAll('_',' ')}${details.note?` · ${String(details.note)}`:''}`;
  if(event.eventType==='transfer.requested')return 'Asset movement submitted for review.';
  if(event.eventType.startsWith('transfer.'))return `Movement: ${String(details.from||'requested').replaceAll('_',' ')} → ${String(details.to||event.eventType.split('.')[1]).replaceAll('_',' ')}`;
  if(event.eventType.startsWith('transfer_batch.'))return `Manifest ${String(details.batchReference||details.batchId||'movement')} · ${String(details.receiptStatus||details.to||'updated').replaceAll('_',' ')}`;
  if(event.eventType==='verification.asset_scanned')return 'The asset was scanned during a verification cycle.';
  if(event.eventType==='verification.cycle_closed')return `${Number(details.unresolvedAssetCount||0)} assets still need review${details.reason?` · ${String(details.reason)}`:''}`;
  if(event.eventType==='verification.cycle_opened'||event.eventType==='verification.cycle_auto_opened')return `Verification cycle opened${details.status?` · ${String(details.status)}`:''}${details.startsAt?` · Starts ${new Date(String(details.startsAt)).toLocaleDateString('en-IN')}`:''}`;
  if(event.eventType==='verification.escalation_notified')return `Escalated to ${Number(details.recipientCount||0)} reviewer${Number(details.recipientCount||0)===1?'':'s'} · level ${String(details.level||'—')}`;
  if(event.eventType==='verification.policy_updated')return 'Verification cadence, scan window, or escalation settings changed.';
  if(event.eventType==='warranty.recorded')return `${String(details.coverageKind||'Coverage').toUpperCase()}${details.endsOn?` · Ends ${String(details.endsOn)}`:''}`;
  if(event.eventType==='asset.created')return 'The asset record and QR identity were created.';
  return 'A change was recorded in the asset history.';
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [view, setView] = useState<View>('home');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [search, setSearch] = useState('');
  const [assetStatusFilter,setAssetStatusFilter]=useState('');
  const [assetStatusChoice,setAssetStatusChoice]=useState('active');
  const [assetCursor,setAssetCursor]=useState<string|null>(null);
  const [assetExports,setAssetExports]=useState<AssetExportJob[]>([]);
  const [exportsBusy,setExportsBusy]=useState(false);
  const [exportScopeChoice,setExportScopeChoice]=useState('');
  const [exportStatusChoice,setExportStatusChoice]=useState('');
  const [exportSearchChoice,setExportSearchChoice]=useState('');
  const [loadingMoreAssets,setLoadingMoreAssets]=useState(false);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locationKind, setLocationKind] = useState<LocationKind>('state');
  const [assetPhotoUrl, setAssetPhotoUrl] = useState('');
  const [assetPhotoFile, setAssetPhotoFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [assetCaptureSuggestions, setAssetCaptureSuggestions] = useState<CaptureSuggestions | null>(null);
  const [invoiceCaptureSuggestions, setInvoiceCaptureSuggestions] = useState<CaptureSuggestions | null>(null);
  const [matchingAssets, setMatchingAssets] = useState<Asset[]>([]);
  const [matchingConfidence, setMatchingConfidence] = useState<'exact' | 'similar' | 'visual' | 'photo' | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [photoClassifierReady, setPhotoClassifierReady] = useState(false);
  const [photoClassifierLoading, setPhotoClassifierLoading] = useState(false);
  const [photoClassifierProgress, setPhotoClassifierProgress] = useState(0);
  const [photoClassifierStage, setPhotoClassifierStage] = useState('');
  const [formSeed, setFormSeed] = useState<RegistrationSeed | null>(null);
  const registrationForm = useRef<HTMLFormElement>(null);
  const registrationBatch = useRef<RegistrationBatch|null>(null);
  const [createdCopies,setCreatedCopies]=useState<Asset[]>([]);
  const [pendingInvoiceLinks,setPendingInvoiceLinks]=useState<Array<{assetId:string;sourceAssetId:string;evidenceId:string;name:string;linkId:string}>>([]);
  const [registrationOwnership,setRegistrationOwnership]=useState('INCUSPAZE_OWNED');
  const [registrationTemplate, setRegistrationTemplate] = useState('general');
  const [completionOnly, setCompletionOnly] = useState(false);
  const [sharedInvoice, setSharedInvoice] = useState<{sourceAssetId:string;evidenceId:string;name:string;linkId:string;targetAssetId?:string}|null>(null);
  const [formSeedVersion, setFormSeedVersion] = useState(0);
  const captureSuggestions = useMemo(() => {
    if (!assetCaptureSuggestions && !invoiceCaptureSuggestions) return null;
    const sourceText = [assetCaptureSuggestions?.sourceText, invoiceCaptureSuggestions?.sourceText]
      .filter(Boolean).join('\n\n--- Invoice capture ---\n\n');
    return { ...(assetCaptureSuggestions || {}), ...(invoiceCaptureSuggestions || {}), sourceText };
  }, [assetCaptureSuggestions, invoiceCaptureSuggestions]);
  useEffect(() => {
    let active = true;
    void isPhotoClassifierCached().then((cached) => { if (active) setPhotoClassifierReady(cached); });
    return () => { active = false; };
  }, []);
  const [pendingCaptures, setPendingCaptures] = useState<PendingCapture[]>([]);
  const [syncingCaptures, setSyncingCaptures] = useState(false);
  const syncLock = useRef(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<PendingAttachment[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const assetRequestId = useRef<string | null>(null);
  const [verificationPolicies, setVerificationPolicies] = useState<VerificationPolicy[]>([]);
  const [verificationCycles, setVerificationCycles] = useState<VerificationCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<VerificationCycle | null>(null);
  const [closingCycleId,setClosingCycleId]=useState('');
  const [cycleAssets, setCycleAssets] = useState<VerificationAsset[]>([]);
  const [rfidCode,setRfidCode]=useState('');
  const [rfidBatchText,setRfidBatchText]=useState('');
  const [rfidBatchLocationId,setRfidBatchLocationId]=useState('');
  const [rfidBatchBusy,setRfidBatchBusy]=useState(false);
  const [rfidBatchSummary,setRfidBatchSummary]=useState<RfidBatchSummary|null>(null);
  const rfidBatchSubmissions=useRef(new Map<string,{epc:string;clientEventId:string;scannedAt:string}[]>());
  const [verificationScanCycleId, setVerificationScanCycleId] = useState<string | null>(null);
  const [scanLocationId,setScanLocationId]=useState('');
  const [pendingScans,setPendingScans]=useState<PendingVerificationScan[]>([]);
  const [syncingScans,setSyncingScans]=useState(false);
  const [reports,setReports]=useState<LifecycleReport[]>([]);
  const [transfers,setTransfers]=useState<AssetTransfer[]>([]);
  const [transferBatches,setTransferBatches]=useState<TransferBatch[]>([]);
  const [batchSourceId,setBatchSourceId]=useState('');
  const batchSourceRequest=useRef(0);
  const [batchAssets,setBatchAssets]=useState<Asset[]>([]);
  const [batchAssetCursor,setBatchAssetCursor]=useState<string|null>(null);
  const [batchAssetsBusy,setBatchAssetsBusy]=useState(false);
  const [selectedBatchAssetIds,setSelectedBatchAssetIds]=useState<string[]>([]);
  const [batchReceiptScannerId,setBatchReceiptScannerId]=useState('');
  const [scannedBatchReceiptIds,setScannedBatchReceiptIds]=useState<Record<string,string[]>>({});
  const [warranties,setWarranties]=useState<WarrantyRecord[]>([]);
  const [assetActivity,setAssetActivity]=useState<AssetActivityEvent[]>([]);
  const [custodyHistory,setCustodyHistory]=useState<AssetCustody[]>([]);
  const [eligibleCustodians,setEligibleCustodians]=useState<EligibleCustodian[]>([]);
  const [operationalAlerts,setOperationalAlerts]=useState<OperationalAlert[]>([]);
  const [alertNextCursor,setAlertNextCursor]=useState<string|null>(null);
  const [loadingMoreAlerts,setLoadingMoreAlerts]=useState(false);
  const [notifications,setNotifications]=useState<UserNotification[]>([]);
  const [unreadNotificationCount,setUnreadNotificationCount]=useState(0);
  const [notificationNextCursor,setNotificationNextCursor]=useState<string|null>(null);
  const [loadingOlderNotifications,setLoadingOlderNotifications]=useState(false);
  const [notificationsLoading,setNotificationsLoading]=useState(false);
  const [notificationPreferences,setNotificationPreferences]=useState<NotificationPreference[]>([]);
  const [savingNotificationPreference,setSavingNotificationPreference]=useState<NotificationCategory|null>(null);
  const [auditEvents,setAuditEvents]=useState<AuditEvent[]>([]);
  const [auditNextCursor,setAuditNextCursor]=useState<string|null>(null);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditLocationFilter,setAuditLocationFilter]=useState('');
  const [auditEventTypeFilter,setAuditEventTypeFilter]=useState('');
  const [overviewData,setOverviewData]=useState<InsightOverview|null>(null);
  const [mapData,setMapData]=useState<IndiaMapData|null>(null);
  const [indiaGeoJson,setIndiaGeoJson]=useState<IndiaGeoJson|null>(null);
  const [mapLoadError,setMapLoadError]=useState('');
  const [selectedMapState,setSelectedMapState]=useState('');
  const [selectedMapCentreId,setSelectedMapCentreId]=useState('');
  const [selectedMapLocationId,setSelectedMapLocationId]=useState('');
  const [mapCoordinateBusy,setMapCoordinateBusy]=useState(false);
  const [mapFilter,setMapFilter]=useState<'all'|'missing'|'attention'|'unused'>('all');
  const [mapLocationAssets,setMapLocationAssets]=useState<Asset[]>([]);
  const [mapLocationAssetCursor,setMapLocationAssetCursor]=useState<string|null>(null);
  const [mapLocationAssetsBusy,setMapLocationAssetsBusy]=useState(false);
  const [managedUsers,setManagedUsers]=useState<ManagedUser[]>([]);
  const [managedUsersBusy,setManagedUsersBusy]=useState(false);
  const [userRoleChoice,setUserRoleChoice]=useState<Role>('viewer');
  const [savingManagedUser,setSavingManagedUser]=useState(false);

  useEffect(()=>{setOperationalAlerts([]);setAlertNextCursor(null);setLoadingMoreAlerts(false);setNotifications([]);setUnreadNotificationCount(0);setNotificationNextCursor(null);setNotificationsLoading(false);setNotificationPreferences([]);setAuditEvents([]);setAuditNextCursor(null);setAuditLocationFilter('');setAuditEventTypeFilter('');},[organization?.id,user?.subject]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (DEMO_MODE) {
        setUser({ subject: 'demo-user', name: 'Asset Team', email: 'demo@incuspaze.example', accessToken: 'demo-only' });
        setOrganizations([DEMO_ORGANIZATION]);
        setOrganization(DEMO_ORGANIZATION);
        setBusy(false);
        return;
      }
      if (!userManager) { setBusy(false); return; }
      try {
        if (window.location.pathname === '/auth/callback') {
          const callbackUser = await userManager.signinCallback();
          window.history.replaceState({}, document.title, '/');
          if (active && callbackUser) setUser(sessionUser(callbackUser));
        } else {
          const currentUser = await userManager.getUser();
          if (active && currentUser && !currentUser.expired) setUser(sessionUser(currentUser));
        }
      } catch {
        if (active) setError('Sign-in could not be completed. Please try again.');
      } finally {
        if (active) setBusy(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || DEMO_MODE) return;
    let active = true;
    setBusy(true);
    api.organizations(user.accessToken)
      .then((items) => {
        if (!active) return;
        setOrganizations(items);
        const savedId = sessionStorage.getItem('incuasset-organization');
        const saved = items.find((item) => item.id === savedId);
        setOrganization(saved || (items.length === 1 ? items[0] : null));
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || !organization) return;
    sessionStorage.setItem('incuasset-organization', organization.id);
    let active = true;
    async function load() {
      try {
        const [places, registeredAssets] = DEMO_MODE
          ? await Promise.all([demoStore.locations(), demoStore.assets()])
          : await Promise.all([api.locations(user!.accessToken, organization!.id), api.assets(user!.accessToken, organization!.id)]).then(([placeRows, assetPage]) => [placeRows, assetPage.data] as const);
        if (active) { setLocations(places); setAssets(registeredAssets); }
      } catch (reason) {
        if (active) setError(errorMessage(reason));
      }
    }
    void load();
    return () => { active = false; };
  }, [user, organization]);

  useEffect(() => {
    if (!user || !organization || view !== 'assets') return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        if(DEMO_MODE){const items=(await demoStore.assets(search)).filter((asset)=>(!assetStatusFilter||asset.status===assetStatusFilter)&&(!completionOnly||missingAssetDetails(asset).length>0));if(active){setAssets(items);setAssetCursor(null);}}
        else {const page=await api.assets(user.accessToken,organization.id,search,assetStatusFilter,'','',completionOnly);if(active){setAssets(page.data);setAssetCursor(page.nextCursor);}}
      } catch (reason) { if (active) setError(errorMessage(reason)); }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [user, organization, search, assetStatusFilter, completionOnly, view]);

  useEffect(()=>{
    if(!user||!organization||view!=='users'||DEMO_MODE)return;
    let active=true;setManagedUsersBusy(true);
    void api.managedUsers(user.accessToken,organization.id).then((rows)=>{if(active)setManagedUsers(rows);})
      .catch((reason)=>{if(active)setError(errorMessage(reason));})
      .finally(()=>{if(active)setManagedUsersBusy(false);});
    return()=>{active=false;};
  },[user,organization,view]);

  useEffect(()=>{
    if(!user||!organization||view!=='exports'||DEMO_MODE)return;
    let active=true;
    let timer=0;
    setExportsBusy(true);
    const refresh=async()=>{
      try {
        const jobs=await api.assetExports(user.accessToken,organization.id);
        if(!active)return;
        setAssetExports(jobs);
        if(jobs.some((job)=>job.status==='queued'||job.status==='running'))timer=window.setTimeout(()=>void refresh(),2500);
      } catch(reason) {
        if(active){setError(errorMessage(reason));timer=window.setTimeout(()=>void refresh(),5000);}
      } finally { if(active)setExportsBusy(false); }
    };
    void refresh();
    return()=>{active=false;window.clearTimeout(timer);};
  },[user,organization,view]);

  useEffect(()=>{
    let active=true;
    fetch('/data/india-states.geojson').then((response)=>{if(!response.ok)throw new Error('Map boundary data is unavailable.');return response.json() as Promise<IndiaGeoJson>;})
      .then((data)=>{if(active)setIndiaGeoJson(data);}).catch(()=>{if(active)setMapLoadError('India state boundaries could not be loaded. The location list is still available.');});
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!user||!organization||view!=='home')return;
    if(DEMO_MODE){setOverviewData({assetCount:assets.length,centreCount:locations.filter((item)=>item.kind==='centre'||item.kind==='warehouse').length,missingCount:assets.filter((item)=>item.status==='missing').length,attentionCount:assets.filter((item)=>item.status==='in_repair'||item.status==='out_of_service').length,unusedCount:assets.filter((item)=>item.status==='unused').length,openReportCount:0,warrantyExpiringCount:0,activeCycleCount:0,openTransferCount:0,scanCompletionPercent:0});return;}
    let active=true;void api.insightOverview(user.accessToken,organization.id).then((data)=>{if(active)setOverviewData(data);}).catch((reason)=>{if(active)setError(errorMessage(reason));});return()=>{active=false;};
  },[user,organization,view,assets.length,locations.length]);

  useEffect(()=>{
    if(!user||!organization||view!=='map')return;
    if(DEMO_MODE){void demoStore.locations().then((places)=>demoStore.assets().then((registered)=>{const centres=places.filter((item)=>item.kind==='centre').map((place)=>{const children=places.filter((item)=>item.id===place.id||isWithinLocation(places,item.id,place.id));const related=registered.filter((asset)=>children.some((child)=>child.id===asset.locationId));return {id:place.id,name:place.name,code:place.code,city:place.city,stateName:place.stateName,physicalAddress:place.physicalAddress,physicalAddressStatus:place.physicalAddressStatus,latitude:place.latitude,longitude:place.longitude,coordinatesStatus:place.coordinatesStatus,assetCount:related.length,missingCount:related.filter((asset)=>asset.status==='missing').length,attentionCount:related.filter((asset)=>asset.status==='in_repair'||asset.status==='out_of_service').length,unusedCount:related.filter((asset)=>asset.status==='unused').length};});const states=[...new Set(centres.map((item)=>item.stateName||'State not recorded'))].map((stateName)=>{const entries=centres.filter((item)=>item.stateName===stateName);return {stateName,centreCount:entries.length,assetCount:entries.reduce((sum,item)=>sum+item.assetCount,0),missingCount:entries.reduce((sum,item)=>sum+item.missingCount,0),attentionCount:entries.reduce((sum,item)=>sum+item.attentionCount,0),unusedCount:entries.reduce((sum,item)=>sum+item.unusedCount,0)};});setMapData({states,centres});}));return;}
    let active=true;void api.mapData(user.accessToken,organization.id).then((data)=>{if(active)setMapData(data);}).catch((reason)=>{if(active)setError(errorMessage(reason));});return()=>{active=false;};
  },[user,organization,view]);

  useEffect(()=>{
    if(!user||!organization||view!=='map'||!selectedMapLocationId){setMapLocationAssets([]);setMapLocationAssetCursor(null);return;}
    let active=true;setMapLocationAssetsBusy(true);
    const load=DEMO_MODE?demoStore.assets().then((items)=>({data:items.filter((item)=>item.locationId===selectedMapLocationId),nextCursor:null})):api.assets(user.accessToken,organization.id,'','','',selectedMapLocationId);
    void load.then((page)=>{if(active){setMapLocationAssets(page.data);setMapLocationAssetCursor(page.nextCursor);}}).catch((reason)=>{if(active)setError(errorMessage(reason));}).finally(()=>{if(active)setMapLocationAssetsBusy(false);});
    return()=>{active=false;};
  },[user,organization,view,selectedMapLocationId]);

  useEffect(()=>{
    if(!user||!organization)return;
    if(DEMO_MODE){if(view==='reports')void demoStore.reports().then(setReports);return;}
    if(view==='reports') void api.reports(user.accessToken,organization.id).then(setReports).catch((reason)=>setError(errorMessage(reason)));
    if(view==='transfers') void Promise.all([api.transfers(user.accessToken,organization.id),api.transferBatches(user.accessToken,organization.id)]).then(([items,batches])=>{setTransfers(items);setTransferBatches(batches);}).catch((reason)=>setError(errorMessage(reason)));
  },[user,organization,view]);

  useEffect(()=>{
    if(!user||!organization||(view!=='alerts'&&view!=='home'&&view!=='notifications'))return;
    if(DEMO_MODE){
      const rows=assets.filter((asset)=>asset.status==='missing').map((asset)=>({id:`missing:${asset.id}`,kind:'missing',severity:'high' as const,title:'Asset marked missing',description:'Review the last known location and record the investigation outcome.',assetId:asset.id,assetTag:asset.assetTag,assetName:asset.name,locationName:asset.locationName,occurredAt:asset.createdAt,relatedId:null}));
      setOperationalAlerts(rows);setAlertNextCursor(null);setNotifications(rows.map((row)=>({...row,sourceAlertId:row.id,createdAt:row.occurredAt,readAt:null})));setUnreadNotificationCount(rows.length);setNotificationNextCursor(null);setNotificationsLoading(false);setNotificationPreferences(NOTIFICATION_CATEGORIES.map(({id})=>({category:id,inAppEnabled:true})));
      return;
    }
    let active=true;setNotificationsLoading(true);
    void Promise.all([api.alerts(user.accessToken,organization.id),api.notifications(user.accessToken,organization.id),api.notificationPreferences(user.accessToken,organization.id)]).then(([alertPage,inbox,preferences])=>{if(active){setOperationalAlerts(alertPage.items);setAlertNextCursor(alertPage.nextCursor);setNotifications(inbox.items);setUnreadNotificationCount(inbox.unreadCount);setNotificationNextCursor(inbox.nextCursor);setNotificationPreferences(preferences.preferences);}}).catch((reason)=>{if(active)setError(errorMessage(reason));}).finally(()=>{if(active)setNotificationsLoading(false);});
    return()=>{active=false;};
  },[user,organization,view,assets]);

  useEffect(()=>{
    if(!user||!organization||view!=='audit'||DEMO_MODE)return;
    let active=true;setAuditLoading(true);setAuditEvents([]);setAuditNextCursor(null);
    void api.auditEvents(user.accessToken,organization.id,{locationId:auditLocationFilter,eventType:auditEventTypeFilter,limit:50})
      .then((page)=>{if(active){setAuditEvents(page.items);setAuditNextCursor(page.nextCursor);}})
      .catch((reason)=>{if(active)setError(errorMessage(reason));})
      .finally(()=>{if(active)setAuditLoading(false);});
    return()=>{active=false;};
  },[user,organization,view,auditLocationFilter,auditEventTypeFilter]);

  useEffect(() => {
    if (!user || !organization || view !== 'verify') return;
    if (DEMO_MODE) { setVerificationPolicies([]); setVerificationCycles([]); setActiveCycle(null); setCycleAssets([]); return; }
    setActiveCycle(null); setCycleAssets([]);
    let active = true;
    void Promise.all([api.verificationPolicies(user.accessToken,organization.id),api.verificationCycles(user.accessToken,organization.id)])
      .then(([policies,cycles]) => { if (active) { setVerificationPolicies(policies); setVerificationCycles(cycles); setActiveCycle(cycles[0] || null); } })
      .catch((reason) => { if (active) setError(errorMessage(reason)); });
    return () => { active=false; };
  }, [user,organization,view]);

  useEffect(() => {
    if (!user || !organization || view !== 'verify' || !activeCycle || DEMO_MODE) { setCycleAssets([]); return; }
    let active=true;
    void api.verificationProgress(user.accessToken,organization.id,activeCycle.id)
      .then((rows) => { if (active) setCycleAssets(rows); })
      .catch((reason) => { if (active) setError(errorMessage(reason)); });
    return () => { active=false; };
  }, [user,organization,view,activeCycle]);

  useEffect(() => {
    setRfidBatchLocationId('');
    setRfidBatchSummary(null);
  }, [activeCycle?.id]);

  useEffect(() => {
    if (!user || !organization || !selectedAsset || view !== 'asset-detail') return;
    let active = true;
    (DEMO_MODE ? listDemoEvidence(selectedAsset.id) : api.evidence(user.accessToken, organization.id, selectedAsset.id))
      .then((items) => { if (active) setEvidence(items); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [user, organization, selectedAsset, view]);

  useEffect(()=>{
    if(!user||!organization||!selectedAsset||view!=='asset-detail'||DEMO_MODE)return;
    let active=true;
    void api.warranties(user.accessToken,organization.id,selectedAsset.id).then((rows)=>{if(active)setWarranties(rows);}).catch((reason)=>{if(active)setError(errorMessage(reason));});
    return()=>{active=false;};
  },[user,organization,selectedAsset,view]);

  useEffect(()=>{
    if(!user||!organization||!selectedAsset||view!=='asset-detail')return;
    if(DEMO_MODE){setAssetActivity([]);setCustodyHistory([]);setEligibleCustodians([]);return;}
    let active=true;
    setAssetActivity([]);setCustodyHistory([]);setEligibleCustodians([]);
    void Promise.all([
      api.assetActivity(user.accessToken,organization.id,selectedAsset.id),
      api.assetCustody(user.accessToken,organization.id,selectedAsset.id),
      api.eligibleCustodians(user.accessToken,organization.id,selectedAsset.id),
    ]).then(([activity,custody,people])=>{if(active){setAssetActivity(activity);setCustodyHistory(custody);setEligibleCustodians(people);}})
      .catch((reason)=>{if(active)setError(errorMessage(reason));});
    return()=>{active=false;};
  },[user,organization,selectedAsset,view]);

  useEffect(() => {
    if (view !== 'qr-label' || !selectedAsset) return;
    let active = true;
    setQrImage('');
    void (async () => {
      try {
        const payload = DEMO_MODE
          ? selectedAsset.qrPublicId
          : user && organization
            ? (await api.signedAssetQr(user.accessToken, organization.id, selectedAsset.id)).value
            : '';
        if (!payload) throw new Error('Sign in and select an organization to issue this QR label.');
        const value = await QRCode.toDataURL(payload, { width: 260, margin: 1, errorCorrectionLevel: 'Q', color: { dark: '#182c43', light: '#ffffff' } });
        if (active) setQrImage(value);
      } catch (reason) {
        if (active) setError(errorMessage(reason));
      }
    })();
    return () => { active = false; };
  }, [view, selectedAsset, user, organization]);

  useEffect(() => () => { if (assetPhotoUrl) URL.revokeObjectURL(assetPhotoUrl); }, [assetPhotoUrl]);

  useEffect(() => {
    if (!organization) { setPendingCaptures([]); return; }
    let active = true;
    void listOfflineAssets().then((items) => { if (active) setPendingCaptures(items.filter((item) => item.organizationId === organization.id)); }).catch(() => {});
    void listVerificationScans().then((items)=>{if(active)setPendingScans(items.filter((item)=>item.organizationId===organization.id));}).catch(()=>{});
    const onOnline = () => { void syncPendingCaptures(); void syncPendingScans(); };
    if (navigator.onLine) { void syncPendingCaptures(); void syncPendingScans(); }
    window.addEventListener('online', onOnline);
    return () => { active = false; window.removeEventListener('online', onOnline); };
  }, [organization, user]);

  const filteredLocations = useMemo(() => locations.filter((item) => !locationFilter || `${item.name} ${item.code || ''} ${item.city || ''}`.toLowerCase().includes(locationFilter.toLowerCase())), [locations, locationFilter]);
  const visibleKinds: LocationKind[] = organization?.roles.some((item) => item.role === 'head_office')
    ? KINDS
    : ['building', 'floor', 'area'];
  const parentLocations = useMemo(() => locations.filter((item) => PARENT_KINDS[locationKind].includes(item.kind)), [locations, locationKind]);
  const assetCounts = useMemo(() => ({ total: assets.length, attention: assets.filter((asset) => asset.status === 'in_repair' || asset.status === 'out_of_service').length, locations: locations.filter((location) => location.kind === 'centre' || location.kind === 'warehouse').length }), [assets, locations]);
  const mapGeometryBounds = useMemo(() => indiaGeoJson ? mapBounds(indiaGeoJson.features) : null, [indiaGeoJson]);
  const parsedRfidBatch = useMemo(() => parseRfidBatchText(rfidBatchText), [rfidBatchText]);
  const mapFilteredCentres = useMemo(() => (mapData?.centres || []).filter((centre)=>mapFilter==='all'||(mapFilter==='missing'?centre.missingCount>0:mapFilter==='attention'?centre.attentionCount>0:centre.unusedCount>0)), [mapData,mapFilter]);
  const mapStates = useMemo(() => {const states=new Map<string,NonNullable<IndiaMapData['states'][number]>>();for(const centre of mapFilteredCentres){const stateName=centre.stateName||'State not recorded';const row=states.get(stateName)||{stateName,centreCount:0,assetCount:0,missingCount:0,attentionCount:0,unusedCount:0};row.centreCount++;row.assetCount+=centre.assetCount;row.missingCount+=centre.missingCount;row.attentionCount+=centre.attentionCount;row.unusedCount+=centre.unusedCount;states.set(stateName,row);}return [...states.values()].sort((a,b)=>a.stateName.localeCompare(b.stateName));}, [mapFilteredCentres]);
  const selectedStateCentres = useMemo(() => mapFilteredCentres.filter((centre) => stateKey(centre.stateName || '') === stateKey(selectedMapState)).sort((a,b)=>(a.city||a.name).localeCompare(b.city||b.name)), [mapFilteredCentres, selectedMapState]);
  const selectedCentre = mapData?.centres.find((centre)=>centre.id===selectedMapCentreId) || null;
  const selectedMapLocation = locations.find((location)=>location.id===selectedMapLocationId) || null;
  const selectedMapChildren = selectedMapLocation ? locations.filter((location)=>location.parentId===selectedMapLocation.id) : [];
  const canConfirmCoordinates = organization?.roles.some((item)=>['head_office','state_head','centre_head'].includes(item.role)) || false;
  const canManageUsers = organization?.roles.some((item)=>['head_office','state_head','centre_head'].includes(item.role)) || false;
  const canViewAudit = canManageUsers;
  const canWriteAssets = organization?.roles.some((item)=>item.role!=='viewer') || false;
  const canVerifyAudits = organization?.roles.some((item)=>item.role!=='viewer') || false;
  const canExportAssets = organization?.roles.some((item)=>['head_office','state_head','centre_head'].includes(item.role)) || false;
  const canExportOrganization = organization?.roles.some((item)=>item.role==='head_office'&&item.scopeLocationId===null) || false;
  const userRoleChoices:Role[] = organization?.roles.some((item)=>item.role==='head_office')
    ? ['state_head','centre_head','asset_custodian','viewer']
    : organization?.roles.some((item)=>item.role==='state_head')
      ? ['centre_head','asset_custodian','viewer']
      : ['asset_custodian','viewer'];
  const userScopeKinds:Record<Role,LocationKind[]>={head_office:[],state_head:['state'],centre_head:['centre'],asset_custodian:['floor','area'],viewer:['state','centre','warehouse','building','floor','area']};
  const userScopeOptions=locations.filter((place)=>userScopeKinds[userRoleChoice].includes(place.kind));
  const activeCustody = custodyHistory.find((item)=>!item.returnedAt) || null;
  const needsStatusReason = Boolean(selectedAsset&&selectedAsset.status!==assetStatusChoice&&['missing','retired','disposed'].includes(assetStatusChoice));

  useEffect(() => {
    if (visibleKinds.length && !visibleKinds.includes(locationKind)) setLocationKind(visibleKinds[0]);
  }, [visibleKinds, locationKind]);

  async function signIn() {
    if (!userManager) return;
    setBusy(true); setError('');
    try { await userManager.signinRedirect(); }
    catch { setError('Could not reach the identity provider. Check your connection and try again.'); setBusy(false); }
  }

  async function signOut() {
    if (DEMO_MODE) {
      sessionStorage.removeItem('incuasset-demo-v1');
      setUser(null); setOrganization(null); setOrganizations([]); setView('home'); return;
    }
    if (!userManager) return;
    try { await userManager.signoutRedirect(); }
    catch { setError('Sign-out could not be completed.'); }
  }

  async function createManagedUser(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!user||!organization||DEMO_MODE)return;
    const form=event.currentTarget;const data=readForm(form);const role=String(data.role) as Role;
    setSavingManagedUser(true);setError('');
    try {
      const created=await api.createManagedUser(user.accessToken,organization.id,{
        identitySubject:String(data.identitySubject),email:String(data.email),displayName:String(data.displayName),
        phoneNumber:data.phoneNumber?String(data.phoneNumber):undefined,role,
        scopeLocationId:data.scopeLocationId?String(data.scopeLocationId):undefined,
      });
      const rows=await api.managedUsers(user.accessToken,organization.id);setManagedUsers(rows);
      setNotice(created.created?'User access added. They can sign in with the connected work account.':'The existing work account has been linked to this role.');
      form.reset();setUserRoleChoice(userRoleChoices[0]||'viewer');
    } catch(reason) { setError(errorMessage(reason)); }
    finally { setSavingManagedUser(false); }
  }

  async function toggleManagedUser(person:ManagedUser) {
    if(!user||!organization||DEMO_MODE)return;
    setError('');
    try {
      await api.setManagedUserActive(user.accessToken,organization.id,person.id,!person.isActive);
      setManagedUsers((rows)=>rows.map((row)=>row.id===person.id?{...row,isActive:!person.isActive}:row));
      setNotice(person.isActive?'User access paused.':'User access restored.');
    } catch(reason) { setError(errorMessage(reason)); }
  }

  async function loadMoreAssets() {
    if (!user || !organization || !assetCursor || loadingMoreAssets || DEMO_MODE) return;
    setLoadingMoreAssets(true);
    try { const page=await api.assets(user.accessToken,organization.id,search,assetStatusFilter,assetCursor,'',completionOnly); setAssets((current)=>[...current,...page.data]); setAssetCursor(page.nextCursor); }
    catch(reason) { setError(errorMessage(reason)); }
    finally { setLoadingMoreAssets(false); }
  }

  async function loadMoreMapLocationAssets() {
    if(!user||!organization||!selectedMapLocationId||!mapLocationAssetCursor||mapLocationAssetsBusy||DEMO_MODE)return;
    setMapLocationAssetsBusy(true);
    try{const page=await api.assets(user.accessToken,organization.id,'','',''+mapLocationAssetCursor,selectedMapLocationId);setMapLocationAssets((current)=>[...current,...page.data]);setMapLocationAssetCursor(page.nextCursor);}
    catch(reason){setError(errorMessage(reason));}finally{setMapLocationAssetsBusy(false);}
  }

  async function saveCentreCoordinates(event:FormEvent<HTMLFormElement>, centre:MapCentre) {
    event.preventDefault(); if(!user||!organization||DEMO_MODE)return;
    const data=readForm(event.currentTarget); const pastedPair=String(data.coordinatePair||'').trim();
    const parsedPair=pastedPair?parseLatitudeLongitude(pastedPair):null;
    if(pastedPair&&!parsedPair){setError('Paste a latitude, longitude pair copied from the selected map pin.');return;}
    const latitude=parsedPair?.latitude??Number(data.latitude),longitude=parsedPair?.longitude??Number(data.longitude);
    if(!isWithinIndia(latitude,longitude)){setError('Enter a valid location within India.');return;}
    setMapCoordinateBusy(true);setError('');
    const physicalAddress=String(data.physicalAddress||'').trim()||null;
    try { await api.confirmCentreCoordinates(user.accessToken,organization.id,centre.id,{latitude,longitude,physicalAddress}); const [nextMap,nextLocations]=await Promise.all([api.mapData(user.accessToken,organization.id),api.locations(user.accessToken,organization.id)]);setMapData(nextMap);setLocations(nextLocations);setNotice('Centre address and map pin saved.'); }
    catch(reason){setError(errorMessage(reason));} finally{setMapCoordinateBusy(false);}
  }

  async function createVerificationPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user || !organization) return;
    const form=event.currentTarget;
    const data=readForm(form);
    setSaving(true); setError('');
    try {
      const policy=await api.createVerificationPolicy(user.accessToken,organization.id,{scopeLocationId:String(data.scopeLocationId),cadenceMonths:Number(data.cadenceMonths),graceDays:Number(data.graceDays),escalationIntervalDays:Number(data.escalationIntervalDays)});
      setVerificationPolicies((items)=>[policy,...items]); setNotice('Verification schedule saved. Existing cycles keep their original dates.'); form.reset();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function updateVerificationPolicy(event:FormEvent<HTMLFormElement>,policy:VerificationPolicy) {
    event.preventDefault(); if(!user||!organization)return;
    const form=event.currentTarget; const data=readForm(form);
    setSaving(true); setError('');
    try {
      const updated=await api.updateVerificationPolicy(user.accessToken,organization.id,policy.id,{
        cadenceMonths:Number(data.cadenceMonths),graceDays:Number(data.graceDays),
        escalationIntervalDays:Number(data.escalationIntervalDays),enabled:String(data.enabled)==='true',
      });
      setVerificationPolicies((items)=>items.map((item)=>item.id===updated.id?updated:item));
      setNotice('Schedule updated. Existing cycle dates stay unchanged; future cycles use these settings.');
    } catch(reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function openVerificationCycle(policyId:string) {
    if (!user || !organization) return;
    setSaving(true); setError('');
    try {
      const result=await api.createVerificationCycle(user.accessToken,organization.id,policyId);
      const cycles=await api.verificationCycles(user.accessToken,organization.id); setVerificationCycles(cycles); setActiveCycle(cycles[0] || null);
      setNotice(result.reused?'An open cycle already exists. It is selected below.':'Verification cycle opened. Assets are marked verified only after a scan is recorded.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function closeVerificationCycle(event:FormEvent<HTMLFormElement>,cycle:VerificationCycle) {
    event.preventDefault(); if(!user||!organization)return;
    const form=event.currentTarget; const reason=String(readForm(form).reason||'').trim();
    if(reason.length<5){setError('Enter a short reason before closing this cycle.');return;}
    setSaving(true); setError('');
    try {
      const result=await api.closeVerificationCycle(user.accessToken,organization.id,cycle.id,reason);
      const closed={...cycle,status:'closed',closedAt:result.closedAt,closeReason:result.closeReason};
      setVerificationCycles((items)=>items.map((item)=>item.id===cycle.id?closed:item));
      setActiveCycle(closed); setClosingCycleId('');
      setNotice(result.unresolvedAssetCount?`Cycle closed with ${result.unresolvedAssetCount} assets still needing review.`:'Cycle closed. All eligible assets were scanned.');
    } catch(reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function recordCycleScan(code:string) {
    if (!user || !organization || !activeCycle) return;
    const normalizedCode=code.trim();
    const rfid=isRfidEpc(normalizedCode);
    try {
      if (!navigator.onLine) {
        const localIdentity=await qrIdentityForOfflineLookup(normalizedCode,organization.id);
        const local=assets.find((asset)=>asset.qrPublicId.toLowerCase()===localIdentity.toLowerCase()||asset.assetTag.toLowerCase()===normalizedCode.toLowerCase()||asset.serialNumber?.toLowerCase()===normalizedCode.toLowerCase()||asset.rfidEpc?.toLowerCase()===normalizedCode.toLowerCase());
        if (!local) throw new Error('This item is not in the device’s saved asset list. Connect to the network before verifying it.');
        const queued=await enqueueVerificationScan({id:crypto.randomUUID(),organizationId:organization.id,cycleId:activeCycle.id,assetId:local.id,locationId:scanLocationId||local.locationId,scannedAt:new Date().toISOString(),identificationMethod:rfid?'rfid':'qr'});
        setPendingScans((items)=>[...items,queued]); setVerificationScanCycleId(null); setView('verify'); setNotice(`${local.assetTag} saved securely on this device. It will sync when you are online.`); return;
      }
      const isQr=isSignedAssetQr(normalizedCode)||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalizedCode);
      const found=rfid ? await api.assetByRfidEpc(user.accessToken,organization.id,normalizedCode).catch(()=>null) : isQr ? await api.assetByQr(user.accessToken,organization.id,normalizedCode).catch(()=>null) : null;
      const matching=found || (await api.assets(user.accessToken,organization.id,normalizedCode)).data.find((asset)=>asset.assetTag.toLowerCase()===normalizedCode.toLowerCase()||asset.serialNumber?.toLowerCase()===normalizedCode.toLowerCase());
      if (!matching) throw new Error('No asset matched that code. Check the tag or scan again.');
      await api.recordVerificationScan(user.accessToken,organization.id,activeCycle.id,{assetId:matching.id,locationId:scanLocationId || matching.locationId,clientEventId:crypto.randomUUID(),scannedAt:new Date().toISOString(),identificationMethod:rfid?'rfid':isQr?'qr':'barcode'});
      setSelectedAsset(matching); setVerificationScanCycleId(null); setCycleAssets(await api.verificationProgress(user.accessToken,organization.id,activeCycle.id));
      setNotice(`${matching.assetTag} recorded for this verification cycle.`); setView('verify');
    } catch (reason) { setError(errorMessage(reason)); setVerificationScanCycleId(null); setView('verify'); }
  }

  async function recordRfidBatch() {
    if(!user||!organization||!activeCycle)return;
    if(activeCycle.status==='closed'){setError('This verification cycle is closed.');return;}
    if(!rfidBatchLocationId){setError('Choose the floor, area, or centre where this reader sweep took place.');return;}
    if(!navigator.onLine){setError('Connect to the network before reconciling an RFID batch. The EPC list will stay in this form.');return;}
    if(parsedRfidBatch.invalidLines.length){setError(`Fix or remove ${parsedRfidBatch.invalidLines.length} invalid reader line${parsedRfidBatch.invalidLines.length===1?'':'s'} before syncing.`);return;}
    if(!parsedRfidBatch.epcs.length){setError('Paste or import at least one valid EPC from the reader.');return;}

    const submissionKey=`${activeCycle.id}:${rfidBatchLocationId}:${parsedRfidBatch.epcs.join(',')}`;
    let readings=rfidBatchSubmissions.current.get(submissionKey);
    if(!readings){
      const scannedAt=new Date().toISOString();
      readings=parsedRfidBatch.epcs.map((epc)=>({epc,clientEventId:crypto.randomUUID(),scannedAt}));
      rfidBatchSubmissions.current.set(submissionKey,readings);
    }
    setRfidBatchBusy(true);setError('');setRfidBatchSummary(null);
    const totals:Omit<RfidScanReconcileResult,'cycleId'>={receivedCount:0,recordedCount:0,duplicateCount:0,wrongLocationCount:0,notRegisteredCount:0,results:[]};
    try{
      for(let start=0;start<readings.length;start+=5000){
        const result=await api.recordRfidScans(user.accessToken,organization.id,activeCycle.id,{
          locationId:rfidBatchLocationId,readings:readings.slice(start,start+5000),
        });
        totals.receivedCount+=result.receivedCount;
        totals.recordedCount+=result.recordedCount;
        totals.duplicateCount+=result.duplicateCount;
        totals.wrongLocationCount+=result.wrongLocationCount;
        totals.notRegisteredCount+=result.notRegisteredCount;
        totals.results.push(...result.results);
      }
      setCycleAssets(await api.verificationProgress(user.accessToken,organization.id,activeCycle.id));
      setRfidBatchSummary({cycleId:activeCycle.id,...totals,inputDuplicateCount:parsedRfidBatch.duplicateCount});
      rfidBatchSubmissions.current.delete(submissionKey);
      setRfidBatchText('');
      setNotice(`RFID sweep checked ${totals.receivedCount} unique tags. ${totals.recordedCount} matched this cycle; review unmatched or misplaced tags below.`);
    }catch(reason){
      if(totals.receivedCount) setNotice(`${totals.receivedCount} reader entries were attempted. Retry this same list to safely finish; already-saved reads use the same event IDs.`);
      setError(errorMessage(reason));
    }finally{setRfidBatchBusy(false);}
  }

  async function syncPendingScans() {
    if (!user||!organization||!navigator.onLine||syncingScans) return;
    setSyncingScans(true);
    try {
      const queued=(await listVerificationScans()).filter((item)=>item.organizationId===organization.id);
      for (const scan of queued) {
        try {
          await api.recordVerificationScan(user.accessToken,organization.id,scan.cycleId,{assetId:scan.assetId,locationId:scan.locationId,clientEventId:scan.id,scannedAt:scan.scannedAt,identificationMethod:scan.identificationMethod||'qr'});
          await removeVerificationScan(scan.id);
        } catch (reason) { await markVerificationScanError(scan.id,errorMessage(reason)); }
      }
      const remaining=(await listVerificationScans()).filter((item)=>item.organizationId===organization.id); setPendingScans(remaining);
      if (remaining.length===0&&queued.length) setNotice(`${queued.length} floor-walk scan${queued.length===1?'':'s'} synced.`);
    } finally { setSyncingScans(false); }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user || !organization) return;
    const form = event.currentTarget;
    const data = readForm(form);
    setSaving(true); setError('');
    try {
      if (DEMO_MODE) await demoStore.createLocation(data as { kind: LocationKind; name: string; parentId?: string; code?: string; city?: string; stateName?: string });
      else await api.createLocation(user.accessToken, organization.id, data as { kind: LocationKind; name: string; parentId?: string; code?: string; city?: string; stateName?: string });
      setLocations(DEMO_MODE ? await demoStore.locations() : await api.locations(user.accessToken, organization.id));
      setNotice('Location added to the register.');
      form.reset();
      setLocationKind(visibleKinds[0]);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function createConditionReport(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!user||!organization)return;
    const form=event.currentTarget; const data=readForm(form); setSaving(true); setError('');
    try {
      if(DEMO_MODE){await demoStore.createReport(data);setReports(await demoStore.reports());setNotice('Sample report saved in this browser only.');form.reset();return;}
      await api.createReport(user.accessToken,organization.id,data); setReports(await api.reports(user.accessToken,organization.id)); setNotice('Report saved and queued for the responsible centre team.'); form.reset();
    }
    catch(reason){setError(errorMessage(reason));} finally{setSaving(false);}
  }

  async function updateConditionReport(report:LifecycleReport,status:string) {
    if(!user||!organization)return;
    try {
      if(DEMO_MODE){await demoStore.updateReport(report.id,status);setReports(await demoStore.reports());setNotice('Sample report updated in this browser only.');return;}
      await api.updateReport(user.accessToken,organization.id,report.id,{status,resolutionNotes:status==='resolved'?'Issue reviewed and marked resolved.':undefined}); setReports(await api.reports(user.accessToken,organization.id)); setNotice('Report status updated.');
    }
    catch(reason){setError(errorMessage(reason));}
  }

  async function createAssetTransfer(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!user||!organization||DEMO_MODE)return;
    const form=event.currentTarget; setSaving(true); setError('');
    try { await api.createTransfer(user.accessToken,organization.id,readForm(form)); setTransfers(await api.transfers(user.accessToken,organization.id)); setNotice('Transfer request sent for source-centre approval.'); form.reset(); }
    catch(reason){setError(errorMessage(reason));} finally{setSaving(false);}
  }

  async function moveTransfer(transfer:AssetTransfer,action:string) {
    if(!user||!organization)return;
    try { await api.transferAction(user.accessToken,organization.id,transfer.id,action); setTransfers(await api.transfers(user.accessToken,organization.id)); if(action==='receive')setAssets((await api.assets(user.accessToken,organization.id,search,assetStatusFilter,'','',completionOnly)).data); setNotice(`Transfer ${action==='receive'?'received':action+'d'}.`); }
    catch(reason){setError(errorMessage(reason));}
  }

  async function loadBatchSourceAssets(locationId:string,cursor='',requestId=batchSourceRequest.current) {
    if(!user||!organization)return;
    setBatchAssetsBusy(true);
    try {
      const page=await api.assets(user.accessToken,organization.id,'','',cursor,locationId);
      if(requestId===batchSourceRequest.current){setBatchAssets((current)=>cursor?[...current,...page.data]:page.data);setBatchAssetCursor(page.nextCursor);}
    } catch(reason) { if(requestId===batchSourceRequest.current)setError(errorMessage(reason)); }
    finally { if(requestId===batchSourceRequest.current)setBatchAssetsBusy(false); }
  }

  async function createTransferBatch(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!user||!organization)return;
    if(selectedBatchAssetIds.length===0){setError('Choose at least one asset for the manifest.');return;}
    const formElement=event.currentTarget;const form=new FormData(formElement);const toLocationId=String(form.get('toLocationId')||'');
    if(!toLocationId){setError('Choose where the manifest is going.');return;}
    setSaving(true);setError('');
    try {
      const created=await api.createTransferBatch(user.accessToken,organization.id,{assetIds:selectedBatchAssetIds,toLocationId,handoverNotes:String(form.get('handoverNotes')||'')});
      setTransferBatches(await api.transferBatches(user.accessToken,organization.id));
      setSelectedBatchAssetIds([]);setBatchAssets((current)=>current.filter((asset)=>!selectedBatchAssetIds.includes(asset.id)));
      formElement.reset();
      setNotice(`Manifest ${created.batchReference} created with ${created.itemCount} assets. It is waiting for approval.`);
    } catch(reason){setError(errorMessage(reason));}
    finally{setSaving(false);}
  }

  async function actOnTransferBatch(batch:TransferBatch,action:'approve'|'dispatch'|'reject'|'cancel') {
    if(!user||!organization)return;
    try { await api.transferBatchAction(user.accessToken,organization.id,batch.id,{action});setTransferBatches(await api.transferBatches(user.accessToken,organization.id));setNotice(`Manifest ${action==='approve'?'approved':action==='dispatch'?'marked in transit':action==='reject'?'declined':'cancelled'}.`); }
    catch(reason){setError(errorMessage(reason));}
  }

  async function receiveTransferBatch(event:FormEvent<HTMLFormElement>,batch:TransferBatch) {
    event.preventDefault();if(!user||!organization)return;
    const form=new FormData(event.currentTarget);
    if(batch.items.some((item)=>!form.get(`receipt-${item.assetId}`))){setError('Choose a receipt outcome for every item before confirming the manifest.');return;}
    const items=batch.items.map((item)=>{
      const receiptStatus=String(form.get(`receipt-${item.assetId}`)) as 'accepted'|'damaged'|'not_received';
      const discrepancyNote=String(form.get(`note-${item.assetId}`)||'').trim();
      return {assetId:item.assetId,receiptStatus,...(discrepancyNote?{discrepancyNote}:{})};
    });
    const scannedIds=scannedBatchReceiptIds[batch.id]||[];
    const scanValidationError=validateTransferReceiptScans(items,scannedIds);
    if(scanValidationError){setError(scanValidationError);return;}
    if(items.some((item)=>item.receiptStatus!=='accepted'&&(item.discrepancyNote?.length||0)<5)){setError('Add a short explanation for every damaged or unreceived item.');return;}
    setSaving(true);setError('');
    try {
      await api.transferBatchAction(user.accessToken,organization.id,batch.id,{action:'receive',items});
      setTransferBatches(await api.transferBatches(user.accessToken,organization.id));
      const page=await api.assets(user.accessToken,organization.id,search,assetStatusFilter,'','',completionOnly);setAssets(page.data);setAssetCursor(page.nextCursor);
      setNotice('Receipt recorded item by item. Any damage or missing items are now flagged for review.');
    } catch(reason){setError(errorMessage(reason));}
    finally{setSaving(false);}
  }

  async function recordBatchReceiptScan(batch:TransferBatch,code:string) {
    let identity=code.trim();
    try {
      if(isSignedAssetQr(identity)) {
        if(!organization) throw new Error('Select an organization before scanning a signed label.');
        identity=navigator.onLine&&user&&!DEMO_MODE
          ? (await api.assetByQr(user.accessToken,organization.id,identity)).qrPublicId
          : (await verifySignedAssetQr(identity,organization.id)).qrPublicId;
      }
    } catch(reason) { setBatchReceiptScannerId('');setError(errorMessage(reason));return; }
    const item=findTransferReceiptAsset(batch.items,identity);
    setBatchReceiptScannerId('');
    if(!item){setError('That QR or barcode is not part of this manifest. No item was confirmed.');return;}
    if((scannedBatchReceiptIds[batch.id]||[]).includes(item.assetId)){setNotice(`${item.assetTag} has already been scanned for this receipt.`);return;}
    setScannedBatchReceiptIds((current)=>({...current,[batch.id]:[...(current[batch.id]||[]),item.assetId]}));
    setNotice(`${item.assetTag} matched this manifest. Choose its condition before confirming receipt.`);
  }

  async function createAssetExport(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!user||!organization||DEMO_MODE)return;
    const scopeLocationId=exportScopeChoice.trim();
    if(!scopeLocationId&&!canExportOrganization){setError('Choose a state, centre, floor, or area for this export.');return;}
    setSaving(true);setError('');
    try {
      const job=await api.createAssetExport(user.accessToken,organization.id,{
        clientRequestId:crypto.randomUUID(),
        ...(scopeLocationId?{scopeLocationId}:{}),
        ...(exportStatusChoice?{status:exportStatusChoice}:{}),
        ...(exportSearchChoice.trim()?{search:exportSearchChoice.trim()}:{}),
      });
      setAssetExports((items)=>[job,...items.filter((item)=>item.id!==job.id)]);
      setNotice('Export queued. You can leave this page while the register is prepared.');
    } catch(reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function cancelAssetExport(job:AssetExportJob) {
    if(!user||!organization)return;
    try {
      const updated=await api.cancelAssetExport(user.accessToken,organization.id,job.id);
      setAssetExports((items)=>items.map((item)=>item.id===updated.id?updated:item));
      setNotice('Queued export cancelled.');
    } catch(reason) { setError(errorMessage(reason)); }
  }

  async function downloadAssetExport(job:AssetExportJob) {
    if(!user||!organization)return;
    try {
      const result=await api.assetExportDownload(user.accessToken,organization.id,job.id);
      window.location.assign(result.downloadUrl);
    } catch(reason) { setError(errorMessage(reason)); }
  }

  async function createWarrantyRecord(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!user||!organization||!selectedAsset||DEMO_MODE)return;
    const form=event.currentTarget; setSaving(true); setError('');
    try { await api.createWarranty(user.accessToken,organization.id,selectedAsset.id,readForm(form)); setWarranties(await api.warranties(user.accessToken,organization.id,selectedAsset.id)); setNotice('Coverage details added to the asset history.'); form.reset(); }
    catch(reason){setError(errorMessage(reason));} finally{setSaving(false);}
  }

  async function refreshAssetTracking(assetId:string) {
    if(!user||!organization||DEMO_MODE)return;
    const [activity,custody,people]=await Promise.all([
      api.assetActivity(user.accessToken,organization.id,assetId),
      api.assetCustody(user.accessToken,organization.id,assetId),
      api.eligibleCustodians(user.accessToken,organization.id,assetId),
    ]);
    setAssetActivity(activity);setCustodyHistory(custody);setEligibleCustodians(people);
  }

  async function issueAssetCustody(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!user||!organization||!selectedAsset||DEMO_MODE)return;
    const form=event.currentTarget;setSaving(true);setError('');
    try{
      await api.issueCustody(user.accessToken,organization.id,selectedAsset.id,readForm(form));
      await refreshAssetTracking(selectedAsset.id);setNotice('Custody issued. The person, condition, and handover are now in the asset history.');form.reset();
    }catch(reason){setError(errorMessage(reason));}finally{setSaving(false);}
  }

  async function returnAssetCustody(event:FormEvent<HTMLFormElement>,custody:AssetCustody) {
    event.preventDefault();if(!user||!organization||!selectedAsset||DEMO_MODE)return;
    const form=event.currentTarget;setSaving(true);setError('');
    try{
      await api.returnCustody(user.accessToken,organization.id,selectedAsset.id,custody.custodyId,readForm(form));
      await refreshAssetTracking(selectedAsset.id);setNotice('Return recorded with the item’s condition.');form.reset();
    }catch(reason){setError(errorMessage(reason));}finally{setSaving(false);}
  }

  async function openAlertAsset(alert:OperationalAlert) {
    if(!user||!organization)return;
    try{
      if(alert.kind==='transfer_stalled'||alert.kind==='transfer_discrepancy'||alert.kind==='transfer_batch_requested'){setView('transfers');return;}
      if(alert.kind==='urgent_report'||alert.kind==='condition_report'){setView('reports');return;}
      const asset=assets.find((item)=>item.id===alert.assetId)||(DEMO_MODE?null:await api.assetById(user.accessToken,organization.id,alert.assetId));
      if(asset){setSelectedAsset(asset);setView('asset-detail');}
      else setView('verify');
    }catch(reason){setError(errorMessage(reason));}
  }

  async function markNotificationRead(notification:UserNotification) {
    if(DEMO_MODE){setNotifications((items)=>items.map((item)=>item.id===notification.id?{...item,readAt:new Date().toISOString()}:item));setUnreadNotificationCount((count)=>Math.max(0,count-(notification.readAt?0:1)));return;}
    if(!user||!organization)return;
    try{
      const updated=await api.markNotificationRead(user.accessToken,organization.id,notification.id);
      setNotifications((items)=>items.map((item)=>item.id===updated.id?{...item,readAt:updated.readAt}:item));
      setUnreadNotificationCount((count)=>Math.max(0,count-(notification.readAt?0:1)));
    }catch(reason){setError(errorMessage(reason));}
  }

  async function loadOlderNotifications() {
    if(!user||!organization||!notificationNextCursor||loadingOlderNotifications||DEMO_MODE)return;
    setLoadingOlderNotifications(true);
    try{
      const page=await api.notifications(user.accessToken,organization.id,notificationNextCursor);
      setNotifications((items)=>{const known=new Set(items.map((item)=>item.id));return [...items,...page.items.filter((item)=>!known.has(item.id))];});
      setNotificationNextCursor(page.nextCursor);
      setUnreadNotificationCount(page.unreadCount);
    }catch(reason){setError(errorMessage(reason));}
    finally{setLoadingOlderNotifications(false);}
  }

  async function loadMoreAlerts() {
    if(!user||!organization||!alertNextCursor||loadingMoreAlerts||DEMO_MODE)return;
    setLoadingMoreAlerts(true);
    try{
      const page=await api.alerts(user.accessToken,organization.id,alertNextCursor);
      setOperationalAlerts((items)=>{const known=new Set(items.map((item)=>item.id));return [...items,...page.items.filter((item)=>!known.has(item.id))];});
      setAlertNextCursor(page.nextCursor);
    }catch(reason){setError(errorMessage(reason));}
    finally{setLoadingMoreAlerts(false);}
  }

  async function toggleNotificationPreference(category:NotificationCategory) {
    if(!user||!organization||DEMO_MODE||savingNotificationPreference)return;
    const current=notificationPreferences.find((item)=>item.category===category)?.inAppEnabled??true;
    setSavingNotificationPreference(category);setError('');
    try{
      const saved=await api.updateNotificationPreference(user.accessToken,organization.id,category,!current);
      setNotificationPreferences((items)=>[...items.filter((item)=>item.category!==category),{category:saved.category,inAppEnabled:saved.inAppEnabled}]);
      const inbox=await api.notifications(user.accessToken,organization.id);
      setNotifications(inbox.items);setNotificationNextCursor(inbox.nextCursor);setUnreadNotificationCount(inbox.unreadCount);
    }catch(reason){setError(errorMessage(reason));}
    finally{setSavingNotificationPreference(null);}
  }

  async function loadOlderAuditEvents() {
    if(!user||!organization||!auditNextCursor||auditLoading||DEMO_MODE)return;
    setAuditLoading(true);
    try{
      const page=await api.auditEvents(user.accessToken,organization.id,{cursor:auditNextCursor,locationId:auditLocationFilter,eventType:auditEventTypeFilter,limit:50});
      setAuditEvents((items)=>{const known=new Set(items.map((item)=>item.id));return [...items,...page.items.filter((item)=>!known.has(item.id))];});
      setAuditNextCursor(page.nextCursor);
    }catch(reason){setError(errorMessage(reason));}
    finally{setAuditLoading(false);}
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user || !organization) return;
    const addNext = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'add-next';
    let capturesComplete = true;
    const data = readForm(event.currentTarget);
    const quantity=selectedAsset ? 1 : Number(data.quantity || 1);
    delete data.quantity;
    if(!Number.isInteger(quantity)||quantity<1||quantity>25){setError('Choose between 1 and 25 identical items.');return;}
    if(quantity>1 && (data.serialNumber||data.assetTag||data.rfidEpc)){setError('Register items with individual serial numbers, tags, or RFID one at a time using Save & add similar.');return;}
    const epc=(event.currentTarget.elements.namedItem('rfidEpc') as HTMLInputElement | null)?.value.trim().toUpperCase() || '';
    if(epc)data.rfidEpc=epc;else if(selectedAsset)data.rfidEpc=null;else delete data.rfidEpc;
    if (!selectedAsset) delete data.rfidChangeReason;
    if (!selectedAsset) delete data.status;
    if (!selectedAsset) {
      assetRequestId.current ||= crypto.randomUUID();
      data.clientRequestId = assetRequestId.current;
    }
    const attachments: PendingAttachment[] = [
      ...(assetPhotoFile ? [{ id: crypto.randomUUID(), kind: 'asset_photo' as const, name: assetPhotoFile.name, contentType: assetPhotoFile.type || 'image/jpeg', file: assetPhotoFile }] : []),
      ...(invoiceFile ? [{ id: crypto.randomUUID(), kind: 'invoice' as const, name: invoiceFile.name, contentType: invoiceFile.type || 'image/jpeg', file: invoiceFile }] : []),
    ];
    setSaving(true); setError('');
    try {
      if (!selectedAsset && !navigator.onLine) {
        if(quantity>1)throw new Error('For an offline capture, save one item at a time. Quantity registration resumes when connected.');
        const draft = data as unknown as OfflineAssetDraft;
        await enqueueOfflineAsset(organization.id, draft, attachments.map(({ id, kind, file }) => ({ id, kind, file: file as File })));
        setPendingCaptures((await listOfflineAssets()).filter((item) => item.organizationId === organization.id));
        setNotice(`Saved securely on this device${attachments.length ? ` with ${attachments.length} capture${attachments.length === 1 ? '' : 's'}` : ''}. It will sync when you are online.`);
        setView('home');
        return;
      }
      let savedRecords:Asset[];
      if(selectedAsset) savedRecords=[DEMO_MODE ? await demoStore.updateAsset(selectedAsset.id,data) : await api.updateAsset(user.accessToken,organization.id,selectedAsset.id,data)];
      else {
        const payload=JSON.stringify({data,quantity});
        if(registrationBatch.current && registrationBatch.current.payload!==payload) throw new Error('This batch has started. Retry with the same details, or open Assets to review the saved items before starting a new batch.');
        registrationBatch.current ||= {payload,ids:Array.from({length:quantity},(_,index)=>index===0?String(data.clientRequestId):crypto.randomUUID()),records:[]};
        savedRecords=await registerCopies(registrationBatch.current,id=>DEMO_MODE?demoStore.createAsset({...data,clientRequestId:id}):api.createAsset(user.accessToken,organization.id,{...data,clientRequestId:id}),setCreatedCopies);
      }
      const asset=savedRecords[0];
      rememberLocation(organization.id,asset.locationId);
      setSelectedAsset(asset); setView(selectedAsset ? 'asset-detail' : 'qr-label');
      setAssets(DEMO_MODE ? await demoStore.assets() : (await api.assets(user.accessToken, organization.id)).data);
      setNotice(selectedAsset ? 'Asset details updated.' : 'Asset saved. Its unique QR identity is ready to print.');
      setPendingEvidenceFiles(attachments);
      if(sharedInvoice) {
        try {
          if(DEMO_MODE) {
            const file=await readDemoEvidence(sharedInvoice.sourceAssetId,sharedInvoice.evidenceId);
            await saveDemoEvidence(asset.id,{id:sharedInvoice.linkId,kind:'invoice',name:sharedInvoice.name,contentType:file.type,file});
          } else await api.linkInvoice(user.accessToken,organization.id,asset.id,sharedInvoice);
          setSharedInvoice(null);
        } catch(reason) { setSharedInvoice({...sharedInvoice,targetAssetId:asset.id}); capturesComplete=false; setView('asset-detail'); setError(`Asset saved, but the invoice link needs retry: ${errorMessage(reason)}`); }
      }
      if (attachments.length && !DEMO_MODE) {
        try {
          await uploadEvidenceFiles(asset.id, attachments);
          setNotice(`${selectedAsset ? 'Asset updated' : 'Asset saved'} with ${attachments.length} attached capture${attachments.length === 1 ? '' : 's'}.`);
          setAssetPhotoFile(null); setInvoiceFile(null); setAssetPhotoUrl('');
        } catch {
          capturesComplete=false;
          if (!selectedAsset) {
            await enqueueOfflineAsset(organization.id, { ...data, clientRequestId: assetRequestId.current || undefined } as unknown as OfflineAssetDraft, attachments.map(({ id, kind, file }) => ({ id, kind, file: file as File })));
            setPendingCaptures((await listOfflineAssets()).filter((item) => item.organizationId === organization.id));
          }
          setView('asset-detail');
          setNotice('Asset saved. A capture needs upload; its encrypted copy is in the device queue for retry.');
        }
      } else if (attachments.length && DEMO_MODE) {
        try {
          await uploadEvidenceFiles(asset.id, attachments);
          setNotice(`Sample asset and ${attachments.length} attachment${attachments.length === 1 ? '' : 's'} saved in this browser. Open the asset to view them.`);
          setAssetPhotoFile(null); setInvoiceFile(null); setAssetPhotoUrl('');
        } catch {
          capturesComplete=false;
          setView('asset-detail');
          setNotice('Sample asset saved. An attachment could not be saved in this browser; retry below.');
        }
      }
      if(savedRecords.length>1) {
        const files=DEMO_MODE?await listDemoEvidence(asset.id):await api.evidence(user.accessToken,organization.id,asset.id);
        const invoice=files.find(item=>item.kind==='invoice') || (attachments.find(item=>item.kind==='invoice') ? {id:attachments.find(item=>item.kind==='invoice')!.id,originalName:attachments.find(item=>item.kind==='invoice')!.name} : sharedInvoice ? {id:sharedInvoice.linkId,originalName:sharedInvoice.name} : undefined);
        if(invoice) {
          const links=savedRecords.slice(1).map(record=>({assetId:record.id,sourceAssetId:asset.id,evidenceId:invoice.id,name:invoice.originalName,linkId:crypto.randomUUID()}));
          setPendingInvoiceLinks(links);
          if(capturesComplete)for(const link of links){try{await saveInvoiceLink(link);setPendingInvoiceLinks(current=>current.filter(item=>item.linkId!==link.linkId));}catch{capturesComplete=false;break;}}
        }
        setNotice(`${savedRecords.length} assets saved with separate QR labels.${!capturesComplete?' Some invoice links need retry below.':''}`);
      }
      if(addNext && capturesComplete && !selectedAsset && quantity===1) await addSimilarAsset(asset);
    } catch (reason) {
      if(reason instanceof ApiError && reason.status>=400 && reason.status<500 && !registrationBatch.current?.records.length){registrationBatch.current=null;assetRequestId.current=null;}
      setError(errorMessage(reason));
    }
    finally { setSaving(false); }
  }

  async function saveInvoiceLink(link:{assetId:string;sourceAssetId:string;evidenceId:string;name:string;linkId:string}) {
    if(!user||!organization)throw new Error('Sign in to link this invoice.');
    if(DEMO_MODE){const file=await readDemoEvidence(link.sourceAssetId,link.evidenceId);await saveDemoEvidence(link.assetId,{id:link.linkId,kind:'invoice',name:link.name,contentType:file.type,file});}
    else await api.linkInvoice(user.accessToken,organization.id,link.assetId,link);
  }

  async function uploadEvidenceFiles(assetId: string, files: PendingAttachment[]) {
    if (!user || !organization) throw new Error('Sign in before saving attachments.');
    setUploadingEvidence(true); setEvidenceError('');
    try {
      for (const attachment of files) {
        if (DEMO_MODE) {
          await saveDemoEvidence(assetId, attachment);
          setPendingEvidenceFiles((current) => current.filter((item) => item.id !== attachment.id));
          continue;
        }
        const digest = await crypto.subtle.digest('SHA-256', await attachment.file.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const visualHash = attachment.kind === 'asset_photo' ? await createVisualHash(attachment.file).catch(() => undefined) : undefined;
        const signed = await api.createEvidenceUpload(user.accessToken, organization.id, assetId, {
          clientEvidenceId: attachment.id, kind: attachment.kind, originalName: attachment.name, contentType: attachment.contentType,
          byteSize: attachment.file.size, sha256, ...(visualHash ? {visualHash} : {}),
        });
        if (!signed.alreadyCompleted) {
          if (!signed.uploadUrl) throw new Error('Private upload link is missing. Retry this capture.');
          const upload = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: attachment.file });
          if (!upload.ok) throw new Error(`Private file upload failed (${upload.status}).`);
          await api.completeEvidenceUpload(user.accessToken, organization.id, assetId, signed.evidenceId);
        }
        setPendingEvidenceFiles((current) => current.filter((item) => item.id !== attachment.id));
      }
      setEvidence(DEMO_MODE ? await listDemoEvidence(assetId) : await api.evidence(user.accessToken, organization.id, assetId));
    } catch (reason) {
      const message = errorMessage(reason);
      setEvidenceError(message);
      throw reason;
    } finally { setUploadingEvidence(false); }
  }

  async function addEvidenceFile(kind: PendingAttachment['kind'], file: File) {
    if (!selectedAsset) return;
    const attachment: PendingAttachment = { id: crypto.randomUUID(), kind, name: file.name, contentType: file.type || 'image/jpeg', file };
    setPendingEvidenceFiles((current) => [...current.filter((item) => item.id !== attachment.id), attachment]);
    try {
      await uploadEvidenceFiles(selectedAsset.id, [attachment]);
      setNotice(kind === 'invoice' ? 'Invoice attached to this asset record.' : 'Asset photo attached to this record.');
    } catch { setNotice('The record is safe. This capture is ready to retry below.'); }
  }

  async function downloadEvidenceFile(item: Evidence) {
    if (!user || !organization || !selectedAsset) return;
    if (DEMO_MODE) {
      const preview = window.open('', '_blank');
      if (preview) preview.opener = null;
      try {
        const file = await readDemoEvidence(selectedAsset.id, item.id);
        const url = URL.createObjectURL(file);
        if (preview) preview.location.href = url;
        else { const link = document.createElement('a'); link.href = url; link.download = item.originalName; link.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (reason) { preview?.close(); setEvidenceError(errorMessage(reason)); }
      return;
    }
    try {
      const result = await api.evidenceDownload(user.accessToken, organization.id, selectedAsset.id, item.id);
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (reason) { setEvidenceError(errorMessage(reason)); }
  }

  async function findScannedCode(code: string) {
    if (!user || !organization) return;
    const normalizedCode=code.trim();
    setError(''); setNotice('Looking up this code…');
    try {
      if (!navigator.onLine) {
        const localIdentity=await qrIdentityForOfflineLookup(normalizedCode,organization.id);
        const localMatch = assets.find((asset) => asset.qrPublicId.toLowerCase() === localIdentity.toLowerCase() || asset.assetTag.toLowerCase() === normalizedCode.toLowerCase() || asset.serialNumber?.toLowerCase() === normalizedCode.toLowerCase() || asset.rfidEpc?.toLowerCase() === normalizedCode.toLowerCase());
        if (localMatch) { setSelectedAsset(localMatch); setNotice('Asset found in this device’s available records.'); setView('asset-detail'); }
        else { setNotice(''); setError('This asset is not in the device’s saved records. Connect to the network to search all centres.'); }
        return;
      }
      const byIdentity = isRfidEpc(normalizedCode)
        ? DEMO_MODE ? (await demoStore.assets()).find((asset)=>asset.rfidEpc?.toLowerCase()===normalizedCode.toLowerCase())||null : await api.assetByRfidEpc(user.accessToken, organization.id, normalizedCode).catch(() => null)
        : isSignedAssetQr(normalizedCode)||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalizedCode)
          ? DEMO_MODE ? await demoStore.assetByQr(normalizedCode) : await api.assetByQr(user.accessToken, organization.id, normalizedCode).catch(() => null)
          : null;
      if (byIdentity) { setSelectedAsset(byIdentity); setNotice('Asset found.'); setView('asset-detail'); return; }
      const matches = DEMO_MODE ? await demoStore.assets(normalizedCode) : (await api.assets(user.accessToken, organization.id, normalizedCode)).data;
      const match = matches.find((asset) => asset.assetTag.toLowerCase() === normalizedCode.toLowerCase() || asset.serialNumber?.toLowerCase() === normalizedCode.toLowerCase()) || matches[0];
      if (!match) { setNotice(''); setError('No matching asset found. Check the code or add the item to the register.'); return; }
      setSelectedAsset(match); setNotice('Asset found.'); setView('asset-detail');
    } catch (reason) { setNotice(''); setError(errorMessage(reason)); }
  }

  async function syncPendingCaptures() {
    if (!organization || !user || !navigator.onLine || syncLock.current) return;
    syncLock.current = true;
    setSyncingCaptures(true);
    let synced = 0;
    try {
      const items = (await listOfflineAssets()).filter((item) => item.organizationId === organization.id);
      for (const item of items) {
        try {
          const payload = { ...item.payload, clientRequestId: item.payload.clientRequestId || item.id };
          const created = DEMO_MODE
            ? await demoStore.createAsset(payload)
            : await api.createAsset(user.accessToken, organization.id, payload);
          for (const attachment of item.attachments) {
            if (!DEMO_MODE) await uploadEvidenceFiles(created.id, [attachment]);
            await removeOfflineAssetAttachment(item.id, attachment.id);
          }
          await removeOfflineAsset(item.id); synced += 1;
        } catch (reason) {
          await markOfflineAssetError(item.id, errorMessage(reason));
        }
      }
      const remaining = (await listOfflineAssets()).filter((item) => item.organizationId === organization.id);
      setPendingCaptures(remaining);
      if (synced) {
        setAssets(DEMO_MODE ? await demoStore.assets() : (await api.assets(user.accessToken, organization.id)).data);
        setNotice(`${synced} offline capture${synced === 1 ? '' : 's'} synced to the register.`);
      }
    } catch (reason) { setError(errorMessage(reason)); }
    finally { syncLock.current = false; setSyncingCaptures(false); }
  }

  async function analyzeCapture(file: File, origin: 'asset' | 'invoice') {
    setCaptureBusy(true); setCaptureProgress(0); setError('');
    let photoClassifierFailed = false;
    try {
      const [text,visualHash,photoSuggestion] = await Promise.all([
        readImageText(file, setCaptureProgress).catch((reason) => origin === 'asset' ? '' : Promise.reject(reason)),
        origin === 'asset' ? createVisualHash(file).catch(() => null) : Promise.resolve(null),
        origin === 'asset' && photoClassifierReady
          ? (async () => {
              setPhotoClassifierLoading(true); setPhotoClassifierProgress(0);
              try {
                await preparePhotoClassifier((percent, stage) => { setPhotoClassifierProgress(percent); setPhotoClassifierStage(stage); });
                return await suggestAssetFromPhoto(file);
              } catch { photoClassifierFailed = true; setPhotoClassifierReady(false); return undefined; }
              finally { setPhotoClassifierLoading(false); }
            })()
          : Promise.resolve(undefined),
      ]);
      if (!text.trim() && !visualHash && !photoSuggestion) throw new Error('The photo did not contain readable text or a usable image signature.');
      let suggestions:CaptureSuggestions = extractInvoiceSuggestions(text);
      const searchTerms = [suggestions.serialNumber, suggestions.model, suggestions.manufacturer, suggestions.category].filter((value): value is string => Boolean(value));
      const [textCandidates,visualCandidates] = await Promise.all([
        DEMO_MODE ? Promise.resolve(assets) : Promise.all(searchTerms.map(async (term) => (await api.assets(user!.accessToken, organization!.id, term)).data)).then((pages)=>pages.flat()).catch(()=>[]),
        visualHash && !DEMO_MODE ? api.visualMatches(user!.accessToken,organization!.id,visualHash,selectedAsset?.locationId).then((result)=>result.matches).catch(()=>[]) : Promise.resolve([]),
      ]);
      const unique = [...new Map([...textCandidates,...visualCandidates].map((asset) => [asset.id, asset])).values()];
      const exact = unique.filter((asset) =>
        (suggestions.serialNumber && asset.serialNumber?.toLowerCase() === suggestions.serialNumber.toLowerCase()) ||
        (suggestions.model && asset.model?.toLowerCase() === suggestions.model.toLowerCase()) ||
        (suggestions.manufacturer && asset.manufacturer?.toLowerCase() === suggestions.manufacturer.toLowerCase()),
      );
      const visual = visualCandidates.filter((asset)=>asset.similarityPercent!==undefined);
      if (!suggestions.category && visual[0]?.similarityPercent!==undefined && visual[0].similarityPercent>=88) {
        suggestions={...suggestions,name:visual[0].name,category:visual[0].category};
      }
      if (photoSuggestion) {
        suggestions = {
          ...suggestions,
          name: suggestions.name || photoSuggestion.name,
          category: suggestions.category || photoSuggestion.category,
          photoHint: `${photoSuggestion.label} · ${Math.round(photoSuggestion.confidence * 100)}% model match`,
          photoConfidence: photoSuggestion.confidence,
        };
      }
      const textSimilar = unique.filter((asset) => suggestions.category && asset.category.toLowerCase() === suggestions.category.toLowerCase()).slice(0, 4);
      const match = exact.length ? exact : visual.length ? visual : textSimilar;
      if (origin === 'asset') setAssetCaptureSuggestions(suggestions);
      else setInvoiceCaptureSuggestions(suggestions);
      if (origin === 'asset') setMatchingAssets(match.slice(0, 5));
      else if (match.length) setMatchingAssets((current)=>[...new Map([...current,...match].map((asset)=>[asset.id,asset])).values()].slice(0,5));
      if (exact.length || visual.length || match.length) setMatchingConfidence(exact.length ? 'exact' : visual.length ? 'visual' : 'similar');
      else if (photoSuggestion) setMatchingConfidence('photo');
      else if (origin === 'asset') setMatchingConfidence(null);
      if (exact.length) setNotice(`A likely existing item matched by product label. Review it before adding another.`);
      else if (visual.length) setNotice(`Compared the photo with saved asset photos on your register. Review these visual matches before adding another.`);
      else if (match.length) setNotice(`Similar ${suggestions.category} assets are in the register. Compare before adding another.`);
      else if (photoSuggestion) setNotice('On-device photo recognition suggested a common equipment type. Confirm it before saving.');
      else if (photoClassifierFailed) setNotice('On-device photo recognition could not load. Prepare it again when this device is online; label reading and photo matching still work.');
      else setNotice(origin === 'invoice' ? 'Invoice read on this device. Review every suggestion before saving.' : photoClassifierReady ? 'Photo checked on this device. No confident equipment category was recognized; review the label or enter the details manually.' : 'Photo checked on this device. Review the label and prepare on-device photo suggestions if useful.');
    } catch {
      setError('Could not read this image. Retake it with the label or invoice text in focus, or enter the details manually.');
    } finally { setCaptureBusy(false); }
  }

  async function preparePhotoSuggestions() {
    setPhotoClassifierLoading(true); setPhotoClassifierProgress(0); setPhotoClassifierStage('Preparing on-device photo recognition'); setError('');
    try {
      await preparePhotoClassifier((percent, stage) => { setPhotoClassifierProgress(percent); setPhotoClassifierStage(stage); });
      setPhotoClassifierReady(true);
      if (assetPhotoFile) {
        const suggestion = await suggestAssetFromPhoto(assetPhotoFile);
        if (suggestion) {
          setAssetCaptureSuggestions((current) => ({
            ...(current || { sourceText: '' }),
            name: current?.name || suggestion.name,
            category: current?.category || suggestion.category,
            photoHint: `${suggestion.label} · ${Math.round(suggestion.confidence * 100)}% model match`,
            photoConfidence: suggestion.confidence,
          }));
          setMatchingConfidence((current) => current || 'photo');
          setNotice('On-device photo recognition suggested a common equipment type. Confirm it before saving.');
        } else {
          setNotice('Photo suggestions are ready on this device. This image did not produce a confident common equipment match.');
        }
      } else {
        setNotice('On-device photo suggestions are ready. They will be available offline on this device.');
      }
    } catch {
      setNotice('Photo recognition could not be prepared. Label reading and saved-photo matching are still available.');
      setPhotoClassifierReady(false);
    } finally { setPhotoClassifierLoading(false); }
  }

  function applyCaptureSuggestions() {
    const form = registrationForm.current;
    if (!captureSuggestions || !form) return;
    let filled = 0;
    for (const [key, value] of Object.entries(captureSuggestions)) {
      const field = form.elements.namedItem(key);
      if (field instanceof HTMLInputElement && !field.value && value != null) {
        field.value = String(value); const details=field.closest('details');if(details)details.open=true;filled++;
      }
    }
    setNotice(filled ? `${filled} empty fields filled. Your existing entries were kept; review the suggested values before saving.` : 'Your entered values were kept. Compare them with the suggestions above.');
  }

  async function addSimilarAsset(source?: Asset) {
    const original = source || selectedAsset;
    if (!original || !organization || !user) return;
    try {
      const files = DEMO_MODE ? await listDemoEvidence(original.id) : await api.evidence(user.accessToken, organization.id, original.id);
      const invoice = files.find(item => item.kind === 'invoice');
      startNewAsset();
      setFormSeed(similarAssetSeed(original)); setRegistrationTemplate(['Furniture','IT equipment','Office equipment'].includes(original.category)?original.category:'general'); setRegistrationOwnership(original.ownershipType);
      setFormSeedVersion(version => version + 1);
      setSharedInvoice(invoice ? {sourceAssetId:original.id,evidenceId:invoice.id,name:invoice.originalName,linkId:crypto.randomUUID()} : null);
      setNotice('Ready for the next item. Location and purchase details are reused; confirm its condition and unit price. Serial number, tag, RFID, and photo start fresh.');
    } catch(reason) { setError(errorMessage(reason)); }
  }

  function startNewAsset() {
    assetRequestId.current = null; registrationBatch.current=null;setCreatedCopies([]);
    setSharedInvoice(null); setRegistrationOwnership('INCUSPAZE_OWNED'); setRegistrationTemplate('general'); setError('');
    setAssetStatusChoice('active');
    setSelectedAsset(null); setFormSeed({sourceText:'',locationId:organization ? rememberedLocation(organization.id,locations) : ''}); setFormSeedVersion(version=>version+1); setAssetCaptureSuggestions(null); setInvoiceCaptureSuggestions(null);
    setMatchingAssets([]); setMatchingConfidence(null); setInvoiceFile(null); setAssetPhotoFile(null); setAssetPhotoUrl(''); setView('asset-form');
  }

  if (busy && !user) return <main className="app-shell"><header className="brandbar"><Brand /></header><section className="loading-state"><span className="spinner" />Preparing your workspace…</section></main>;
  if (!user) return <SignIn error={error} onSignIn={signIn} configured={oidcConfigured} />;
  if (busy && !organization && organizations.length === 0) return <main className="app-shell"><header className="brandbar"><Brand /></header><section className="loading-state"><span className="spinner" />Checking your workspace access…</section></main>;
  if (!busy && organizations.length === 0) return <main className="app-shell"><header className="brandbar"><Brand /><button className="quiet-button signout" onClick={signOut}>Sign out</button></header><section className="org-picker"><p className="eyebrow">WORKSPACE ACCESS</p><h1>No register is assigned yet.</h1><p className="lead">Ask your administrator to add your account to an Incuspaze organization, then sign in again.</p></section></main>;
  if (organizations.length > 1 && !organization) return <main className="app-shell"><header className="brandbar"><Brand /><button className="quiet-button signout" onClick={signOut}>Sign out</button></header><section className="org-picker"><p className="eyebrow">YOUR WORKSPACES</p><h1>Choose your register.</h1><div className="org-list">{organizations.map((item) => <button key={item.id} onClick={() => setOrganization(item)}><strong>{item.name}</strong><small>{item.roles.map((role) => role.role.replaceAll('_', ' ')).join(' · ')}</small><span>→</span></button>)}</div></section></main>;

  return (
    <main className={`workspace ${view === 'qr-label' ? 'printing' : ''}`}>
      <header className="workspace-header">
        <Brand />
        <div className="workspace-controls">
          {DEMO_MODE && <span className="demo-pill">DEMO · browser only</span>}
          {organizations.length > 1 && <label className="org-select-label"><span className="sr-only">Organization</span><select value={organization?.id} onChange={(event) => setOrganization(organizations.find((item) => item.id === event.target.value) || null)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <button className="notification-button" onClick={()=>setView('notifications')} aria-label={`Notifications, ${unreadNotificationCount} unread`} title="Notifications"><Icon name="bell"/>{unreadNotificationCount>0&&<span>{unreadNotificationCount>99?'99+':unreadNotificationCount}</span>}</button>
          <span className="user-initial" aria-label={`Signed in as ${user.name}`}>{user.name.slice(0,1).toUpperCase()}</span>
          <button className="quiet-button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <div className="workspace-body">
        <nav className="workspace-nav" aria-label="Main navigation">
          <button className={view === 'home' ? 'selected' : ''} onClick={() => setView('home')}><Icon name="home" />Overview</button>
          <button className={view === 'alerts' ? 'selected' : ''} onClick={() => setView('alerts')}><Icon name="watch" />Watch{operationalAlerts.length>0&&<span className="nav-count">{operationalAlerts.length>99?'99+':operationalAlerts.length}</span>}</button>
          <button className={view === 'map' ? 'selected' : ''} onClick={() => {setSelectedMapState('');setSelectedMapCentreId('');setSelectedMapLocationId('');setView('map');}}><Icon name="pin" />India map</button>
          <button className={view === 'locations' ? 'selected' : ''} onClick={() => setView('locations')}><Icon name="pin" />Locations</button>
          <button className={view === 'assets' || view === 'exports' || view === 'asset-detail' || view === 'asset-form' || view === 'qr-label' || view === 'scanner' ? 'selected' : ''} onClick={() => setView('assets')}><Icon name="asset" />Assets</button>
          <button className={view === 'verify' ? 'selected' : ''} onClick={() => setView('verify')}><Icon name="check" />Verify</button>
          {!DEMO_MODE&&canViewAudit&&<button className={view==='audit'?'selected':''} onClick={()=>setView('audit')}><Icon name="history"/>Audit trail</button>}
          <button className={view === 'reports' ? 'selected' : ''} onClick={() => setView('reports')}><Icon name="asset" />Reports</button>
          <button className={view === 'transfers' ? 'selected' : ''} onClick={() => setView('transfers')}><Icon name="arrow" />Transfers</button>
          {!DEMO_MODE&&canManageUsers&&<button className={view==='users'?'selected':''} onClick={()=>setView('users')}><Icon name="people"/>People & access</button>}
        </nav>
        <section className="workspace-content" aria-live="polite">
          {error && <div className="inline-message error-message" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
          {notice && <div className="inline-message success-message" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
          {DEMO_MODE && <div className="demo-banner"><strong>Sample workspace</strong><span>Changes are temporary in this browser. Live records require organization sign-in.</span></div>}

          {view === 'home' && <section className="view-panel">
            <p className="eyebrow">{organization?.name || 'ASSET REGISTER'} · OVERVIEW</p>
            <div className="view-title-row"><div><h1>Every asset, in its place.</h1><p className="view-lead">A clear, accountable picture of the network you care for.</p></div><button className="primary-button add-button" onClick={startNewAsset}><Icon name="plus" /> Add asset</button></div>
            {pendingCaptures.length > 0 && <section className="offline-queue"><div className="offline-queue-heading"><div><p className="eyebrow">DEVICE QUEUE · {pendingCaptures.length}</p><h2>Saved here, ready to sync.</h2></div><button className="quiet-button" onClick={() => void syncPendingCaptures()} disabled={syncingCaptures}>{syncingCaptures ? 'Syncing…' : 'Sync now'}</button></div>{pendingCaptures.map((item) => <div className="offline-queue-row" key={item.id}><span className="queue-dot" /><span><strong>{item.payload.name}</strong><small>{item.payload.category} · {locations.find((place) => place.id === item.payload.locationId)?.name || 'Saved location'}</small>{item.lastError && <em>{item.lastError}</em>}</span><small>{item.lastError ? 'Needs attention' : 'Waiting for connection'}</small></div>)}</section>}
            <div className="summary-grid"><Summary label="Registered assets" value={overviewData?.assetCount ?? assetCounts.total} detail="Across your visible locations" /><Summary label="Centres & warehouses" value={overviewData?.centreCount ?? assetCounts.locations} detail="In the active directory" /><Summary label="Need attention" value={(overviewData?.attentionCount ?? assetCounts.attention)+(overviewData?.openReportCount||0)} detail={`${overviewData?.missingCount||0} marked missing · ${overviewData?.unusedCount||0} unused`} /></div>
            <button className="home-alert-link" onClick={()=>setView('alerts')}><span className="home-alert-icon"><Icon name="watch"/></span><span><strong>Exceptions & review items</strong><small>Missing records, overdue scans, duplicate serials, and stalled handovers</small></span><b>{alertNextCursor?'50+':operationalAlerts.length||overviewData?.missingCount||0}</b><Icon name="arrow"/></button>
            <div className="operations-watch" aria-label="Operational watch"><button onClick={()=>setView('verify')}><span>Verification cycles</span><strong>{overviewData?.activeCycleCount ?? 0}</strong><small>{overviewData?.scanCompletionPercent ?? 0}% scanned · active scope <b>→</b></small></button><button onClick={()=>setView('transfers')}><span>Transfers in motion</span><strong>{overviewData?.openTransferCount ?? 0}</strong><small>awaiting the next step <b>→</b></small></button><button onClick={()=>setView('assets')}><span>Coverage ending soon</span><strong>{overviewData?.warrantyExpiringCount ?? 0}</strong><small>warranty or service <b>→</b></small></button></div>
            <div className="home-columns"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECENTLY RECORDED</p><h2>Latest assets</h2></div><button className="text-button" onClick={() => setView('assets')}>Browse register →</button></div><AssetRows assets={assets.slice(0,4)} onSelect={(asset) => { setSelectedAsset(asset); setView('asset-detail'); }} /></section><section className="panel location-teaser"><p className="eyebrow">THE NETWORK</p><h2>Every centre has a place.</h2><p>Browse state, centre, building, floor, and area records. Precise centre pins can be confirmed by the people who know the space.</p><button className="text-button" onClick={() => setView('locations')}>Manage locations →</button></section></div>
          </section>}

          {view === 'notifications' && <section className="view-panel lifecycle-view alert-view notification-view">
            <p className="eyebrow">YOUR INBOX · PRIVATE TO YOUR ACCOUNT</p>
            <div className="view-title-row"><div><h1>Notifications.</h1><p className="view-lead">Signals saved for your account. Items follow your current asset access and remain here after you read them.</p></div><button className="quiet-button" onClick={()=>setView('alerts')}>Open Watch →</button></div>
            {!DEMO_MODE&&<section className="panel notification-preferences"><div className="panel-heading"><div><p className="eyebrow">YOUR PREFERENCES</p><h2>Choose what reaches your inbox.</h2></div></div><p className="preference-note">You can quiet routine categories. High-priority alerts remain on so missing assets and urgent issues are not hidden.</p><div className="preference-list">{NOTIFICATION_CATEGORIES.map(({id,title,detail})=>{const enabled=notificationPreferences.find((item)=>item.category===id)?.inAppEnabled??true;return <div className="preference-row" key={id}><span><strong>{title}</strong><small>{detail}</small></span><button className={`preference-switch ${enabled?'is-on':''}`} type="button" role="switch" aria-checked={enabled} aria-label={`${title} notifications`} disabled={notificationsLoading||savingNotificationPreference!==null} onClick={()=>void toggleNotificationPreference(id)}><span/></button></div>;})}</div></section>}
            <div className="alert-queue-summary"><span><strong>{unreadNotificationCount}</strong> unread · {notifications.length} loaded</span><small>In-app only · signals sync when you open or refresh the app</small></div>
            {notifications.length===0?notificationsLoading?<section className="panel verify-empty"><span className="spinner" aria-hidden="true"/><h2>Checking your inbox.</h2><p>Loading review signals for the centres you can access.</p></section>:<section className="panel verify-empty"><Icon name={DEMO_MODE?'bell':'check'}/><h2>{DEMO_MODE?'No sample alerts in this workspace.':'You’re all caught up.'}</h2><p>{DEMO_MODE?'The sample workspace has no active review signals. Sign in to see notifications scoped to your organization and centres.':'New missing-asset, overdue-scan, transfer, duplicate-record, and urgent-report signals will appear here.'}</p></section>:<><div className="alert-list">{notifications.map((item)=><article className={`panel alert-row notification-row ${item.readAt?'is-read':''} severity-${item.severity}`} key={item.id}><span className="alert-mark"><Icon name={item.kind==='verification_overdue'?'history':item.kind==='duplicate_serial'?'asset':item.kind==='transfer_stalled'||item.kind==='transfer_discrepancy'||item.kind==='transfer_batch_requested'?'arrow':'watch'}/></span><div className="alert-main"><div className="alert-title-line"><h2>{item.title}</h2><span className={`status-chip alert-severity-${item.severity}`}>{item.readAt?'Read':item.severity==='high'?'Review soon':'Check'}</span></div><strong>{item.assetName} · {item.assetTag}</strong><small>{item.locationName} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</small><p>{item.description}</p><div className="notification-actions"><button className="text-button" onClick={()=>void openAlertAsset(item)}>{item.kind==='verification_overdue'?'Review asset and scan cycle':item.kind==='transfer_stalled'||item.kind==='transfer_discrepancy'||item.kind==='transfer_batch_requested'?'Open transfer manifest':item.kind==='urgent_report'||item.kind==='condition_report'?'Open repair report':'Open asset record'} <span aria-hidden="true">→</span></button>{!item.readAt&&<button className="text-button notification-read-action" onClick={()=>void markNotificationRead(item)}>Mark as read</button>}</div></div></article>)}</div>{notificationNextCursor&&<button className="load-more-button quiet-button" onClick={()=>void loadOlderNotifications()} disabled={loadingOlderNotifications}>{loadingOlderNotifications?'Loading…':'Load older notifications'}</button>}</>}
          </section>}

          {view==='audit'&&canViewAudit&&<section className="view-panel audit-view"><p className="eyebrow">ACCOUNTABILITY · ORGANIZATION AUDIT</p><div className="view-title-row"><div><h1>Every change has a trail.</h1><p className="view-lead">Review who changed records, moved assets, verified items, and updated reports within your assigned locations.</p></div></div><section className="panel audit-filters"><label>Location<select aria-label="Filter audit events by location" value={auditLocationFilter} onChange={(event)=>setAuditLocationFilter(event.target.value)}><option value="">All locations in my access</option>{locations.map((place)=><option key={place.id} value={place.id}>{place.kind.replaceAll('_',' ')} · {place.name}</option>)}</select></label><label>Activity<select aria-label="Filter audit events by activity" value={auditEventTypeFilter} onChange={(event)=>setAuditEventTypeFilter(event.target.value)}><option value="">All activity</option>{AUDIT_EVENT_TYPES.map((eventType)=><option key={eventType} value={eventType}>{activityTitle(eventType)}</option>)}</select></label></section>{auditEvents.length===0?auditLoading?<section className="panel verify-empty"><span className="spinner" aria-hidden="true"/><h2>Loading the audit trail.</h2><p>Only events within your assigned locations are included.</p></section>:<section className="panel verify-empty"><Icon name="history"/><h2>No matching activity.</h2><p>Try another location or activity filter. New record changes, scans, handovers, and reports will appear here.</p></section>:<section className="panel audit-timeline-panel"><div className="panel-heading"><div><p className="eyebrow">SCOPED RECORD</p><h2>{auditEvents.length}{auditNextCursor?'+':''} recent events</h2></div><small>Newest first · your assigned scope</small></div><ol className="activity-timeline audit-timeline">{auditEvents.map((event)=><li key={event.id}><span className="activity-node"><Icon name="history"/></span><div className="activity-copy"><strong>{activityTitle(event.eventType)}</strong><p>{activitySummary(event)}</p><small>{event.actorName} · {event.locationName} · {new Date(event.occurredAt).toLocaleString('en-IN')}</small></div></li>)}</ol>{auditNextCursor&&<button className="load-more-button quiet-button" onClick={()=>void loadOlderAuditEvents()} disabled={auditLoading}>{auditLoading?'Loading…':'Load older activity'}</button>}</section>}</section>}

          {view === 'alerts' && <section className="view-panel lifecycle-view alert-view">
            <p className="eyebrow">ORGANIZATION WATCH · ACTION QUEUE</p>
            <div className="view-title-row"><div><h1>Review what needs attention.</h1><p className="view-lead">Signals are based on recorded activity. An overdue scan is a prompt to investigate, never a declaration that an asset is stolen.</p></div><button className="quiet-button" onClick={()=>setView('home')}>← Overview</button></div>
            <div className="alert-queue-summary"><span><strong>{operationalAlerts.length}</strong> shown{alertNextCursor?' · more available':' · open signals in your access scope'}</span><small>Prioritized by urgency · every result is limited to your assigned locations</small></div>
            {DEMO_MODE?<section className="panel verify-empty"><Icon name="watch"/><h2>Live signals need organization data.</h2><p>Sign in to see overdue scan checks, duplicate serials, transfer delays, and urgent reports.</p></section>:operationalAlerts.length===0?notificationsLoading?<section className="panel verify-empty"><span className="spinner" aria-hidden="true"/><h2>Checking the Watch queue.</h2><p>Loading open signals for the locations you can access.</p></section>:<section className="panel verify-empty"><Icon name="check"/><h2>No review signals right now.</h2><p>When the register finds an overdue scan window, duplicate serial, stalled transfer, receipt discrepancy, or unresolved urgent report, it will appear here.</p></section>:<><div className="alert-list">{operationalAlerts.map((alert)=><article className={`panel alert-row severity-${alert.severity}`} key={alert.id}><span className="alert-mark"><Icon name={alert.kind==='verification_overdue'?'history':alert.kind==='duplicate_serial'?'asset':alert.kind==='transfer_stalled'||alert.kind==='transfer_discrepancy'?'arrow':'watch'}/></span><div className="alert-main"><div className="alert-title-line"><h2>{alert.title}</h2><span className={`status-chip alert-severity-${alert.severity}`}>{alert.severity==='high'?'Review soon':'Check'}</span></div><strong>{alert.assetName} · {alert.assetTag}</strong><small>{alert.locationName} · {new Date(alert.occurredAt).toLocaleDateString('en-IN')}</small><p>{alert.description}</p><button className="text-button" onClick={()=>void openAlertAsset(alert)}>{alert.kind==='verification_overdue'?'Review asset and scan cycle':alert.kind==='transfer_stalled'?'Open asset movement':alert.kind==='transfer_discrepancy'?'Review transfer discrepancy':alert.kind==='urgent_report'?'Open repair report':'Open asset record'} <span aria-hidden="true">→</span></button></div></article>)}</div>{alertNextCursor&&<button className="load-more-button quiet-button" onClick={()=>void loadMoreAlerts()} disabled={loadingMoreAlerts}>{loadingMoreAlerts?'Loading…':'Load more review items'}</button>}</>}
            <p className="alert-footnote">Signals help teams notice risks sooner. A person still checks the evidence, contacts the centre, and records any confirmed loss or corrective action.</p>
          </section>}

          {view === 'map' && <section className="view-panel map-view">
            <p className="eyebrow">THE NETWORK · INDIA</p>
            <div className="view-title-row"><div><h1>Every centre, on the map.</h1><p className="view-lead">Choose a state, then a centre, then move inward to its buildings and floors. Pins appear only when a centre location has been confirmed.</p></div></div>
            <div className="map-summary-strip"><span><strong>{mapFilteredCentres.length}</strong> centres in this view</span><span><strong>{mapFilteredCentres.reduce((sum,item)=>sum+item.assetCount,0)}</strong> registered assets</span><span><strong>{mapFilteredCentres.reduce((sum,item)=>sum+item.missingCount,0)}</strong> marked missing</span></div>
            <div className="map-filter-bar" role="group" aria-label="Filter centres by asset condition">{([['all','All centres'],['missing','Missing'],['attention','Needs attention'],['unused','Unused stock']] as const).map(([value,label])=><button key={value} className={mapFilter===value?'active':''} aria-pressed={mapFilter===value} onClick={()=>{setMapFilter(value);setSelectedMapState('');setSelectedMapCentreId('');setSelectedMapLocationId('');}}>{label}{value==='missing'&&<span>{mapData?.centres.reduce((sum,item)=>sum+item.missingCount,0)||0}</span>}</button>)}</div>
            <div className="map-explorer">
              <section className="panel india-map-panel" aria-label="India state map">
                <div className="panel-heading"><div><p className="eyebrow">STATE VIEW</p><h2>{selectedMapState || 'India'}</h2></div>{selectedMapState&&<button className="text-button" onClick={()=>{setSelectedMapState('');setSelectedMapCentreId('');setSelectedMapLocationId('');}}>Show all India</button>}</div>
                {mapLoadError&&<p className="form-hint" role="status">{mapLoadError}</p>}
                {!indiaGeoJson||!mapGeometryBounds ? <div className="map-loading"><span className="spinner"/>Loading state boundaries…</div> : <svg className="india-map-svg" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label="Select a state on the map">
                  <defs><pattern id="map-grain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#789384" opacity=".16"/></pattern></defs>
                  {indiaGeoJson.features.map((feature)=>{const name=feature.properties.name;const state=mapStates.find((item)=>stateKey(item.stateName)===stateKey(name));const selected=stateKey(selectedMapState)===stateKey(name);return <path key={name} d={featurePath(feature,mapGeometryBounds)} className={`india-state-shape${selected?' chosen':''}${state?.centreCount?' has-centres':''}`} role="button" tabIndex={0} aria-label={`${name}: ${state?.centreCount||0} centres, ${state?.assetCount||0} assets`} aria-pressed={selected} onClick={()=>{setSelectedMapState(name);setSelectedMapCentreId('');setSelectedMapLocationId('');}} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedMapState(name);setSelectedMapCentreId('');setSelectedMapLocationId('');}}}><title>{name} · {state?.centreCount||0} centres · {state?.assetCount||0} assets</title></path>;})}
                  {mapFilteredCentres.filter((centre)=>centre.latitude!==null&&centre.longitude!==null&&(centre.coordinatesStatus==='centre_head_confirmed'||centre.coordinatesStatus==='verified')&&(!selectedMapState||stateKey(centre.stateName||'')===stateKey(selectedMapState))).map((centre)=>{const [x,y]=mapProject(centre.longitude!,centre.latitude!,mapGeometryBounds);return <g key={centre.id} className={`map-centre-pin${selectedMapCentreId===centre.id?' active':''}`} role="button" tabIndex={0} aria-label={`${centre.name}, ${centre.assetCount} assets`} onClick={()=>{setSelectedMapCentreId(centre.id);setSelectedMapLocationId('');}} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedMapCentreId(centre.id);setSelectedMapLocationId('');}}}><circle className="pin-halo" cx={x} cy={y} r="9"/><circle className="pin-core" cx={x} cy={y} r="3.8"/><title>{centre.city||centre.name} · {centre.assetCount} assets</title></g>;})}
                </svg>}
                <div className="map-legend"><span><i className="legend-state"/>State boundary</span><span><i className="legend-pin"/>Confirmed centre</span><small>Illustrative boundaries for navigation · not for legal use</small></div>
              </section>
              <aside className="panel map-directory-panel">
                {selectedMapLocation ? <><button className="back-action" onClick={()=>setSelectedMapLocationId(selectedMapCentreId)}>← Back to {selectedCentre?.city||'centre'}</button><p className="eyebrow">{selectedMapLocation.kind.toUpperCase()} · PLACE DETAILS</p><h2>{selectedMapLocation.name}</h2><p className="map-context">{selectedMapLocation.city||selectedMapLocation.stateName||'Location'} · {selectedMapLocation.coordinatesStatus.replaceAll('_',' ')}</p><div className="map-drill-list">{selectedMapChildren.map((child)=><button className="map-place-row" key={child.id} onClick={()=>setSelectedMapLocationId(child.id)}><span className="map-place-icon"><Icon name={child.kind}/></span><span><strong>{child.name}</strong><small>{child.kind} · {locations.filter((item)=>item.parentId===child.id).length} lower levels</small></span><span className="row-arrow"><Icon name="arrow"/></span></button>)}{!selectedMapChildren.length&&<div className="empty-state"><strong>No lower-level places yet.</strong><small>Centre managers can add buildings, floors, and areas from Locations.</small><button className="text-button" onClick={()=>setView('locations')}>Manage locations →</button></div>}</div><div className="map-place-assets"><div className="panel-heading"><div><p className="eyebrow">ASSETS HERE</p><h3>Registered items</h3></div><span className="evidence-count">{mapLocationAssets.length}{mapLocationAssetCursor?' +':''}</span></div>{mapLocationAssetsBusy&&!mapLocationAssets.length?<div className="map-loading"><span className="spinner"/>Loading assets…</div>:<><AssetRows assets={mapLocationAssets} onSelect={(asset)=>{setSelectedAsset(asset);setView('asset-detail');}} empty="No assets are assigned to this exact place."/>{mapLocationAssetCursor&&<button className="quiet-button load-more-button" onClick={()=>void loadMoreMapLocationAssets()} disabled={mapLocationAssetsBusy}>{mapLocationAssetsBusy?'Loading…':'Load more assets'}</button>}</>}</div></> : selectedCentre ? <><button className="back-action" onClick={()=>setSelectedMapCentreId('')}>← Back to {selectedMapState||'state centres'}</button><p className="eyebrow">CENTRE · {selectedCentre.code||'NO CODE'}</p><h2>{selectedCentre.name}</h2><p className="map-context">{selectedCentre.city||'City not recorded'} · {selectedCentre.stateName||selectedMapState}</p>{selectedCentre.physicalAddress&&<p className="map-address-line"><span>{selectedCentre.physicalAddress}</span><small>Address · {selectedCentre.physicalAddressStatus.replaceAll('_',' ')}</small></p>}<div className="map-metrics"><span><strong>{selectedCentre.assetCount}</strong> assets</span><span><strong>{selectedCentre.missingCount}</strong> missing</span><span><strong>{selectedCentre.attentionCount}</strong> needs care</span></div><div className="map-drill-list">{locations.filter((item)=>item.parentId===selectedCentre.id).map((item)=><button className="map-place-row" key={item.id} onClick={()=>setSelectedMapLocationId(item.id)}><span className="map-place-icon"><Icon name={item.kind}/></span><span><strong>{item.name}</strong><small>{item.kind} · {locations.filter((child)=>child.parentId===item.id).length} lower levels</small></span><span className="row-arrow"><Icon name="arrow"/></span></button>)}{!locations.some((item)=>item.parentId===selectedCentre.id)&&<div className="empty-state"><strong>No buildings recorded yet.</strong><small>Add buildings, floors, and areas to make the map useful inside this centre.</small><button className="text-button" onClick={()=>setView('locations')}>Add centre locations →</button></div>}</div>{canConfirmCoordinates&&!DEMO_MODE&&<form key={selectedCentre.id} className="coordinate-form" onSubmit={(event)=>void saveCentreCoordinates(event,selectedCentre)}><p className="eyebrow">{selectedCentre.coordinatesStatus==='unverified'?'CONFIRM THIS CENTRE PIN':'UPDATE THIS CENTRE PIN'}</p><p>Find the exact building in Google Maps, copy its coordinates, then paste them here. The map pin appears after an authorized centre manager confirms it.</p><a className="coordinate-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selectedCentre.name,selectedCentre.physicalAddress,selectedCentre.city,selectedCentre.stateName,'India'].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Find {selectedCentre.city||'this centre'} in Google Maps ↗</a><label>Centre street address <small>Use the exact building address. Clear this field to remove a saved address.</small><input name="physicalAddress" maxLength={300} defaultValue={selectedCentre.physicalAddress||''} placeholder="Building, street, area, PIN code" /></label><label className="coordinate-paste">Paste latitude, longitude<input name="coordinatePair" type="text" inputMode="decimal" autoComplete="off" placeholder="28.4595, 77.0266"/></label><p className="coordinate-separator">Or enter each value separately</p><div className="coordinate-inputs"><label>Latitude<input name="latitude" type="number" step="any" defaultValue={selectedCentre.latitude??''} placeholder="28.4595"/></label><label>Longitude<input name="longitude" type="number" step="any" defaultValue={selectedCentre.longitude??''} placeholder="77.0266"/></label></div><button className="primary-button" disabled={mapCoordinateBusy}>{mapCoordinateBusy?'Saving…':selectedCentre.coordinatesStatus==='unverified'?'Confirm centre location':'Update centre location'}</button></form>}</> : <><p className="eyebrow">{selectedMapState?'CENTRES IN THIS STATE':'STATE DIRECTORY'}</p><h2>{selectedMapState||'Choose a state'}</h2><p className="map-context">{selectedMapState?'Select a centre to see its buildings, floors, and asset counts.':'Select a state on the map or from this list.'}</p><div className="map-drill-list">{selectedMapState?selectedStateCentres.map((centre)=><button className="map-centre-row" key={centre.id} onClick={()=>setSelectedMapCentreId(centre.id)}><span className="map-centre-dot"/><span><strong>{centre.name}</strong><small>{centre.code||centre.city||centre.stateName} · {centre.assetCount} assets</small></span><span className="map-row-count">{centre.missingCount?`${centre.missingCount} review`:'Open'} <Icon name="arrow"/></span></button>):mapStates.map((state)=><button className="map-centre-row" key={state.stateName} onClick={()=>{setSelectedMapState(state.stateName);setSelectedMapCentreId('');}}><span className="map-centre-dot state-dot"/><span><strong>{state.stateName}</strong><small>{state.centreCount} centres · {state.assetCount} assets</small></span><span className="map-row-count">{state.missingCount?`${state.missingCount} review`:'View'} <Icon name="arrow"/></span></button>)}{!mapStates.length&&<div className="empty-state"><strong>No centres in your access scope.</strong><small>Location access is limited by your organization role.</small></div>}</div></>}
              </aside>
            </div>
          </section>}

          {view === 'locations' && <section className="view-panel">
            <p className="eyebrow">LOCATION DIRECTORY</p><div className="view-title-row"><div><h1>One network. Clear locations.</h1><p className="view-lead">Keep the India → state → centre → floor → area hierarchy current.</p></div></div>
            <div className="locations-layout"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">AUTHORIZED LOCATIONS</p><h2>{locations.length} places</h2></div></div><label className="search-box"><Icon name="search" /><input value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} placeholder="Search location or centre code" /></label><LocationRows locations={filteredLocations} allLocations={locations} /></section>
              <form className="panel entry-form compact-form" onSubmit={createLocation}><p className="eyebrow">CENTRE SETUP</p><h2>Add a place</h2><p className="form-intro">Choose the parent first. The hierarchy prevents assets from drifting between centres.</p><label>Location level<select name="kind" value={locationKind} required onChange={(event) => setLocationKind(event.target.value as LocationKind)}>{visibleKinds.map((kind) => <option value={kind} key={kind}>{kind[0].toUpperCase()+kind.slice(1)}</option>)}</select></label><label>Location name<input name="name" required maxLength={120} placeholder="e.g. Ahmedabad Krish Cubicle" /></label>{locationKind === 'state' ? <p className="form-hint"><span aria-hidden="true">⌖</span><span>States are top-level locations in the India network.</span></p> : <label>Parent location<select name="parentId" required defaultValue=""><option value="" disabled>Select a {PARENT_KINDS[locationKind].join(' or ')}</option>{parentLocations.map((location) => <option key={location.id} value={location.id}>{location.kind} · {location.name}</option>)}</select></label>}<label>Centre code<input name="code" maxLength={40} placeholder="e.g. AHKC" /></label><label>City<input name="city" maxLength={80} placeholder="City" /></label><label>State<input name="stateName" maxLength={80} placeholder="State" /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add location'}<span aria-hidden="true">→</span></button></form>
            </div>
          </section>}

          {view === 'verify' && <section className="view-panel verify-view">
            <p className="eyebrow">ASSET CHECK · SIX-MONTH CYCLE</p><div className="view-title-row"><div><h1>Know what’s been seen.</h1><p className="view-lead">A missed scan stays a review item. It is never marked stolen automatically.</p></div></div>
            {pendingScans.length>0&&<section className="offline-queue scan-queue"><div className="offline-queue-heading"><div><p className="eyebrow">DEVICE QUEUE · {pendingScans.length}</p><h2>Floor-walk scans saved here.</h2></div><button className="quiet-button" onClick={()=>void syncPendingScans()} disabled={syncingScans}>{syncingScans?'Syncing…':'Sync scans'}</button></div>{pendingScans.map((scan)=><div key={scan.id} className="offline-queue-row"><span className="queue-dot"/><span><strong>{assets.find((asset)=>asset.id===scan.assetId)?.name||'Verified asset'}</strong><small>{assets.find((asset)=>asset.id===scan.assetId)?.assetTag||scan.assetId} · {locations.find((place)=>place.id===scan.locationId)?.name||'Saved location'}</small>{scan.lastError&&<em>{scan.lastError}</em>}</span><small>{scan.lastError?'Needs attention':'Waiting for connection'}</small></div>)}</section>}
            {DEMO_MODE ? <section className="panel verify-empty"><Icon name="check"/><h2>Verification cycles connect to the live register.</h2><p>Sign in through your organization to open a cycle, record scans, and review assets that were not seen.</p></section> : <>
              {verificationPolicies.length===0 && <section className="panel verify-empty"><Icon name="check"/><h2>No scan schedule yet.</h2><p>Head Office can set a six-month cadence and a two-month completion window for a state or centre.</p></section>}
              {verificationPolicies.length>0 && <section className="panel policy-panel"><div className="panel-heading"><div><p className="eyebrow">CYCLE SCHEDULES</p><h2>Choose a cycle to work on</h2></div></div><div className="cycle-grid">{verificationPolicies.map((policy)=><article className="cycle-policy" key={policy.id}><div className="cycle-policy-summary"><span className="cycle-mark"><Icon name="check"/></span><div><strong>{policy.scopeLocationName}</strong><small>{policy.enabled?'Automated':'Paused'} · every {policy.cadenceMonths} months · {policy.graceDays} day scan window · escalate every {policy.escalationIntervalDays} days</small></div><button className="quiet-button" disabled={saving} onClick={()=>void openVerificationCycle(policy.id)}>Open cycle</button></div>{organization?.roles.some((role)=>role.role==='head_office')&&<form className="cycle-policy-settings" onSubmit={(event)=>void updateVerificationPolicy(event,policy)}><label>Repeat every (months)<input aria-label={`Repeat every months for ${policy.scopeLocationName}`} name="cadenceMonths" type="number" min="1" max="24" defaultValue={policy.cadenceMonths}/></label><label>Scan window (days)<input aria-label={`Scan window days for ${policy.scopeLocationName}`} name="graceDays" type="number" min="0" max="180" defaultValue={policy.graceDays}/></label><label>Escalate every (days)<input aria-label={`Escalate every days for ${policy.scopeLocationName}`} name="escalationIntervalDays" type="number" min="1" max="90" defaultValue={policy.escalationIntervalDays}/></label><label>Automation<select aria-label={`Automation status for ${policy.scopeLocationName}`} name="enabled" defaultValue={policy.enabled?'true':'false'}><option value="true">On</option><option value="false">Paused</option></select></label><button className="quiet-button" disabled={saving}>{saving?'Saving…':'Save settings'}</button></form>}</article>)}</div></section>}
              {verificationCycles.length>0 && <section className="cycle-tabs" aria-label="Verification cycles">{verificationCycles.map((cycle)=><button key={cycle.id} className={activeCycle?.id===cycle.id?'active':''} onClick={()=>setActiveCycle(cycle)}><strong>{cycle.scopeLocationName}</strong><small>{new Date(cycle.startsAt).toLocaleDateString('en-IN')} · {cycle.status}</small></button>)}</section>}
              {activeCycle && <section className="panel cycle-progress-panel"><div className="cycle-progress-heading"><div><p className="eyebrow">{activeCycle.status.toUpperCase()} · {activeCycle.scopeLocationName}</p><h2>{cycleAssets.filter((item)=>item.scanned).length} <span>of {cycleAssets.length} verified</span></h2><p>Complete by {new Date(activeCycle.graceEndsAt).toLocaleDateString('en-IN')}</p></div><div className="cycle-progress-actions">{canVerifyAudits&&<button className="primary-button" disabled={activeCycle.status==='closed'} onClick={()=>{setScanLocationId('');setVerificationScanCycleId(activeCycle.id);setView('scanner');}}>Scan an asset</button>}{organization?.roles.some((role)=>role.role==='head_office')&&activeCycle.status!=='closed'&&<button type="button" className="text-button" onClick={()=>setClosingCycleId(closingCycleId===activeCycle.id?'':activeCycle.id)}>{closingCycleId===activeCycle.id?'Cancel close':'Close cycle'}</button>}</div></div>{organization?.roles.some((role)=>role.role==='head_office')&&activeCycle.status!=='closed'&&closingCycleId===activeCycle.id&&<form className="cycle-close-form" onSubmit={(event)=>void closeVerificationCycle(event,activeCycle)}><label>Why are you closing this cycle?<input name="reason" minLength={5} maxLength={500} required placeholder="Record the review or exception decision"/></label><button className="quiet-button" disabled={saving}>{saving?'Closing…':'Confirm close'}</button></form>}{activeCycle.status==='closed'&&<p className="cycle-close-record">Closed {activeCycle.closedAt?new Date(activeCycle.closedAt).toLocaleString('en-IN'):''} · {activeCycle.closeReason||'No closure note was recorded.'}</p>}<div className="cycle-progress-track" role="progressbar" aria-label="Cycle completion" aria-valuemin={0} aria-valuemax={cycleAssets.length} aria-valuenow={cycleAssets.filter((item)=>item.scanned).length}><span style={{width:`${cycleAssets.length?cycleAssets.filter((item)=>item.scanned).length/cycleAssets.length*100:0}%`}}/></div>{canVerifyAudits&&<RfidBatchAudit locations={locations.filter((place)=>place.kind!=='state'&&isWithinLocation(locations,place.id,activeCycle.scopeLocationId))} selectedLocationId={rfidBatchLocationId} onLocationChange={(value)=>setRfidBatchLocationId(value)} text={rfidBatchText} onTextChange={(value)=>{setRfidBatchText(value);setRfidBatchSummary(null);setError('');}} parsed={parsedRfidBatch} busy={rfidBatchBusy} closed={activeCycle.status==='closed'} summary={rfidBatchSummary} onSubmit={()=>void recordRfidBatch()} />}<form className="rfid-quick-entry" onSubmit={(event)=>{event.preventDefault();if(!isRfidEpc(rfidCode)){setError('Enter a valid hexadecimal EPC from the RFID tag.');return;}setError('');void recordCycleScan(rfidCode);setRfidCode('');}}><label>Check one RFID tag <small>Use a compatible reader’s keyboard-wedge mode</small><input aria-label="RFID EPC" autoCapitalize="characters" maxLength={64} onChange={(event)=>setRfidCode(event.target.value.toUpperCase())} pattern="(?:[A-Fa-f0-9]{2}){4,32}" placeholder="Hexadecimal EPC from the tag" value={rfidCode}/></label><button className="quiet-button" disabled={activeCycle.status==='closed'||!rfidCode.trim()}>Find and record</button></form><div className="cycle-asset-list">{cycleAssets.map((item)=><article key={item.assetId} className="cycle-asset-row"><span className={`cycle-state ${item.scanned?'seen':item.reviewState==='unseen_after_window'?'overdue':''}`}><Icon name={item.scanned?'check':'asset'}/></span><span><strong>{item.name}</strong><small>{item.assetTag} · {item.locationName}</small></span><span className={`cycle-review cycle-${item.reviewState}`}>{item.scanned?'Verified':item.reviewState==='unseen_after_window'?'Needs review':'Not scanned'}</span></article>)}</div>{cycleAssets.some((item)=>item.reviewState==='unseen_after_window')&&<p className="review-note">Some assets were not seen before the scan window ended. Review their last known location and contact the responsible centre; no loss status was applied.</p>}</section>}
              {organization?.roles.some((item)=>item.role==='head_office')&&<form className="panel entry-form policy-create" onSubmit={createVerificationPolicy}><p className="eyebrow">HEAD OFFICE · CYCLE SETTINGS</p><h2>Set a verification schedule</h2><div className="form-grid"><label>State or centre<select name="scopeLocationId" required defaultValue=""><option value="" disabled>Choose a scope</option>{locations.filter((item)=>item.kind==='state'||item.kind==='centre').map((item)=><option key={item.id} value={item.id}>{item.kind} · {item.name}</option>)}</select></label><label>Repeat every<select name="cadenceMonths" defaultValue="6"><option value="6">6 months</option><option value="3">3 months</option><option value="12">12 months</option></select></label><label>Completion window<select name="graceDays" defaultValue="60"><option value="60">2 months · 60 days</option><option value="30">1 month · 30 days</option><option value="90">3 months · 90 days</option></select></label><label>Escalate to next role every (days)<input aria-label="Escalation interval days" type="number" name="escalationIntervalDays" min="1" max="90" defaultValue="7" required/></label></div><button className="primary-button" disabled={saving}>{saving?'Saving…':'Save schedule'}</button></form>}
            </>}
          </section>}

          {view === 'reports' && <section className="view-panel lifecycle-view"><p className="eyebrow">ASSET CARE · REPORTS</p><div className="view-title-row"><div><h1>Give every issue an owner.</h1><p className="view-lead">Report damage, repair needs, and items that can no longer work. Each update stays in the asset history.</p></div></div>
            <div className="lifecycle-layout"><form className="panel entry-form compact-form" onSubmit={createConditionReport}><p className="eyebrow">NEW REPORT</p><h2>What needs attention?</h2><label>Asset<select name="assetId" required defaultValue=""><option value="" disabled>Choose asset</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.assetTag} · {asset.name}</option>)}</select></label><label>Issue<select name="kind" defaultValue="damaged"><option value="damaged">Damaged</option><option value="needs_repair">Needs repair</option><option value="not_working">Not working</option><option value="other">Other</option></select></label><label>Urgency<select name="urgency" defaultValue="normal"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>What happened?<textarea name="description" rows={4} minLength={5} maxLength={2000} required placeholder="Describe what you noticed and when." /></label><button className="primary-button" disabled={saving}>{saving?'Saving…':'Submit report'}</button></form><section className="panel lifecycle-list"><div className="panel-heading"><div><p className="eyebrow">AUTHORIZED ASSETS</p><h2>{reports.filter((report) => report.status !== 'closed' && report.status !== 'resolved').length} open reports</h2></div></div>{reports.length===0?<div className="empty-state"><Icon name="check"/><strong>No reports yet.</strong><small>New repair and damage reports will appear here.</small></div>:reports.map((report)=><article className="lifecycle-row" key={report.id}><span className={`urgency-mark urgency-${report.urgency}`}><Icon name="asset"/></span><div className="lifecycle-row-main"><strong>{report.assetName}</strong><small>{report.assetTag} · {report.locationName}</small><p>{report.description}</p><small>{report.kind.replaceAll('_',' ')} · {new Date(report.reportedAt).toLocaleDateString('en-IN')}</small></div><div className="lifecycle-row-actions"><span className={`status-chip status-${report.status}`}>{report.status.replaceAll('_',' ')}</span>{organization?.roles.some((role)=>['head_office','state_head','centre_head'].includes(role.role))&&report.status!=='closed'&&report.status!=='resolved'&&<button className="text-button" onClick={()=>void updateConditionReport(report,report.status==='reported'?'assigned':report.status==='assigned'?'in_repair':'resolved')}>{report.status==='reported'?'Assign':report.status==='assigned'?'Start repair':'Resolve'}</button>}</div></article>)}</section></div>
          </section>}

          {view === 'transfers' && <section className="view-panel lifecycle-view"><p className="eyebrow">ASSET MOVEMENT · TRANSFERS</p><div className="view-title-row"><div><h1>Move with a clear handover.</h1><p className="view-lead">The register changes location only after the receiving centre confirms arrival.</p></div></div>
            {DEMO_MODE?<section className="panel verify-empty"><Icon name="arrow"/><h2>Transfers connect to the live register.</h2><p>Sign in to request, approve, dispatch, and receive assets.</p></section>:<>
              <div className="lifecycle-layout"><form className="panel entry-form compact-form" onSubmit={createAssetTransfer}><p className="eyebrow">ONE ITEM</p><h2>Request a move</h2><label>Asset<select name="assetId" required defaultValue=""><option value="" disabled>Choose asset</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.assetTag} · {asset.name} · {asset.locationName}</option>)}</select></label><label>Destination<select name="toLocationId" required defaultValue=""><option value="" disabled>Choose centre or store</option>{locations.filter((place)=>place.kind==='centre'||place.kind==='warehouse'||place.kind==='floor'||place.kind==='area').map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}</option>)}</select></label><label>Handover notes<textarea name="handoverNotes" rows={3} maxLength={2000} placeholder="Condition, packing, courier, or contact details." /></label><button className="primary-button" disabled={saving}>{saving?'Sending…':'Request transfer'}</button></form><section className="panel lifecycle-list"><div className="panel-heading"><div><p className="eyebrow">MOVEMENT HISTORY</p><h2>{transfers.length} single-item requests</h2></div></div>{transfers.length===0?<div className="empty-state"><Icon name="arrow"/><strong>No transfers in your scope.</strong><small>Approved movement requests will appear here.</small></div>:transfers.map((transfer)=><article className="lifecycle-row" key={transfer.id}><span className="transfer-mark"><Icon name="arrow"/></span><div className="lifecycle-row-main"><strong>{transfer.assetName}</strong><small>{transfer.assetTag} · {transfer.fromLocationName} → {transfer.toLocationName}</small><p>{transfer.handoverNotes||'No handover notes added.'}</p><small>Requested {new Date(transfer.requestedAt).toLocaleDateString('en-IN')}</small></div><div className="lifecycle-row-actions"><span className="status-chip">{transfer.status.replaceAll('_',' ')}</span>{transfer.status==='requested'&&<button className="text-button" onClick={()=>void moveTransfer(transfer,'approve')}>Approve</button>}{transfer.status==='approved'&&<button className="text-button" onClick={()=>void moveTransfer(transfer,'dispatch')}>Mark dispatched</button>}{transfer.status==='in_transit'&&<button className="text-button" onClick={()=>void moveTransfer(transfer,'receive')}>Confirm receipt</button>}</div></article>)}</section></div>
              <section className="panel batch-workspace"><div className="panel-heading"><div><p className="eyebrow">MULTI-ASSET HANDOVER</p><h2>Move a group together.</h2></div><span className="evidence-count">Up to 100 assets</span></div><p className="batch-intro">Choose a shared starting location, select the items leaving together, then record each item separately when it arrives.</p>
                <div className="batch-create-grid"><div className="batch-picker"><label className="batch-field">Starting location<select value={batchSourceId} onChange={(event)=>{const id=event.target.value;const requestId=++batchSourceRequest.current;setBatchSourceId(id);setSelectedBatchAssetIds([]);setBatchAssets([]);setBatchAssetCursor(null);if(id)void loadBatchSourceAssets(id,'',requestId);}}><option value="">Choose source location</option>{locations.filter((place)=>['centre','warehouse','building','floor','area'].includes(place.kind)).map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}</option>)}</select></label>{batchSourceId&&<div className="batch-asset-picker"><div className="batch-picker-heading"><strong>Select items at this location</strong><span>{selectedBatchAssetIds.length} selected</span></div>{batchAssets.map((asset)=><label className="batch-asset-option" key={asset.id}><input type="checkbox" checked={selectedBatchAssetIds.includes(asset.id)} disabled={!selectedBatchAssetIds.includes(asset.id)&&(selectedBatchAssetIds.length>=100||['missing','retired','disposed'].includes(asset.status))} onChange={(event)=>setSelectedBatchAssetIds((current)=>event.target.checked?[...current,asset.id]:current.filter((id)=>id!==asset.id))}/><span><strong>{asset.name}</strong><small>{asset.assetTag} · {asset.status.replaceAll('_',' ')}</small></span></label>)}{batchAssetsBusy&&<p className="batch-loading">Loading assets…</p>}{!batchAssetsBusy&&!batchAssets.length&&<p className="batch-loading">No assets found at this location.</p>}{batchAssetCursor&&<button type="button" className="quiet-button batch-more" onClick={()=>void loadBatchSourceAssets(batchSourceId,batchAssetCursor)} disabled={batchAssetsBusy}>{batchAssetsBusy?'Loading…':'Load more assets'}</button>}</div>}</div>
                  <form className="batch-destination-form" onSubmit={createTransferBatch}><label className="batch-field">Destination<select name="toLocationId" required defaultValue=""><option value="" disabled>Choose destination</option>{locations.filter((place)=>place.id!==batchSourceId&&['centre','warehouse','building','floor','area'].includes(place.kind)).map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}</option>)}</select></label><label className="batch-field">Manifest notes<textarea name="handoverNotes" rows={4} maxLength={2000} placeholder="Carrier, packing reference, handover contact, or context for the receiving team." /></label><p className="batch-helper">A manager approves the manifest before dispatch. Items stay at their current location until the receiving team confirms them.</p><button className="primary-button" disabled={saving||!selectedBatchAssetIds.length}>{saving?'Creating…':`Create manifest · ${selectedBatchAssetIds.length}`}</button></form>
                </div>
              </section>
              <section className="panel batch-history"><div className="panel-heading"><div><p className="eyebrow">MANIFESTS</p><h2>{transferBatches.length} grouped handovers</h2></div></div>{!transferBatches.length?<div className="empty-state"><Icon name="arrow"/><strong>No grouped handovers in your scope.</strong><small>Manifests will show item-by-item receipt and any discrepancies here.</small></div>:transferBatches.map((batch)=><article className="batch-card" key={batch.id}><div className="batch-card-heading"><div><p className="eyebrow">{batch.batchReference} · {batch.itemCount} ITEMS</p><h3>{batch.fromLocationName} <span aria-label="to">→</span> {batch.toLocationName}</h3></div><span className={`status-chip ${batch.overdue?'status-in_repair':''}`}>{batch.overdue?'overdue':batch.status.replaceAll('_',' ')}</span></div><p className="batch-card-notes">{batch.handoverNotes||'No handover notes added.'}</p>{batch.status==='in_transit'&&<div className="batch-scan-entry"><button type="button" className="quiet-button" onClick={()=>setBatchReceiptScannerId(batch.id)}>Scan arrival labels <span>{(scannedBatchReceiptIds[batch.id]||[]).length} / {batch.itemCount}</span></button><small>Each received item must match a QR label in this manifest.</small>{batchReceiptScannerId===batch.id&&<div className="batch-scanner"><CodeScanner onCode={(code)=>recordBatchReceiptScan(batch,code)} onClose={()=>setBatchReceiptScannerId('')}/></div>}</div>}<div className="batch-card-items">{batch.items.map((item)=><div className="batch-receipt-row" key={item.assetId}><span><strong>{item.assetName}</strong><small>{item.assetTag}</small>{(scannedBatchReceiptIds[batch.id]||[]).includes(item.assetId)&&<small className="batch-scan-confirmed">QR matched this manifest</small>}</span>{batch.status==='in_transit'?<label className="batch-receipt-control"><span>Arrival</span><select name={`receipt-${item.assetId}`} form={`receipt-form-${batch.id}`} defaultValue="" required><option value="" disabled>Choose item outcome</option><option value="accepted">Received in good order</option><option value="damaged">Received damaged</option><option value="not_received">Not received</option></select></label>:<span className={`status-chip ${item.receiptStatus==='damaged'?'status-in_repair':''}`}>{item.receiptStatus.replaceAll('_',' ')}</span>}{batch.status==='in_transit'&&<label className="batch-note-control">Discrepancy note <input name={`note-${item.assetId}`} form={`receipt-form-${batch.id}`} maxLength={2000} placeholder="Required if damaged or not received" /></label>}{item.discrepancyNote&&<small className="batch-discrepancy">{item.discrepancyNote}</small>}</div>)}</div><div className="batch-card-footer"><small>{batch.status==='in_transit'&&batch.autoFlagAfter?`Arrival review due ${new Date(batch.autoFlagAfter).toLocaleDateString('en-IN')}`:`Requested ${new Date(batch.requestedAt).toLocaleDateString('en-IN')}`}</small><div className="lifecycle-row-actions">{batch.status==='requested'&&<><button className="text-button" onClick={()=>void actOnTransferBatch(batch,'approve')}>Approve</button><button className="text-button" onClick={()=>void actOnTransferBatch(batch,'reject')}>Decline</button></>}{batch.status==='approved'&&<><button className="text-button" onClick={()=>void actOnTransferBatch(batch,'dispatch')}>Mark dispatched</button><button className="text-button" onClick={()=>void actOnTransferBatch(batch,'cancel')}>Cancel</button></>}{batch.status==='in_transit'&&<form id={`receipt-form-${batch.id}`} onSubmit={(event)=>void receiveTransferBatch(event,batch)}><button className="primary-button batch-receive-button" disabled={saving}>Confirm every item</button></form>}</div></div></article>)}</section>
            </>}
          </section>}

          {view === 'users' && canManageUsers && <section className="view-panel users-view">
            <p className="eyebrow">TEAM · SCOPED ACCESS</p>
            <div className="view-title-row"><div><h1>Give each person the right reach.</h1><p className="view-lead">Access follows the state, centre, or floor they are responsible for.</p></div><span className="user-total">{managedUsers.length} people</span></div>
            <div className="users-layout">
              <form className="panel user-create-panel" onSubmit={(event)=>void createManagedUser(event)}>
                <div className="panel-heading"><div><p className="eyebrow">ADD A TEAM MEMBER</p><h2>Set their access.</h2></div><Icon name="people"/></div>
                <p className="user-create-note">The person must already have an account in your connected work sign-in. This links their account; it does not create a password or send an invitation.</p>
                <label>Identity provider subject<input name="identitySubject" required maxLength={255} placeholder="Exact account subject (sub)" autoComplete="off" /></label>
                <div className="user-form-grid"><label>Full name<input name="displayName" required maxLength={160} placeholder="Name shown in the register" /></label><label>Work email<input name="email" type="email" required maxLength={254} placeholder="name@company.com" /></label></div>
                <label>Phone number <small>Optional</small><input name="phoneNumber" type="tel" maxLength={32} placeholder="+91 …" /></label>
                <div className="user-form-grid"><label>Role<select name="role" value={userRoleChoice} onChange={(event)=>setUserRoleChoice(event.target.value as Role)}>{userRoleChoices.map((role)=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}</select></label><label>Access scope<select key={userRoleChoice} name="scopeLocationId" required defaultValue=""><option value="" disabled>Choose a location</option>{userScopeOptions.map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}{place.city?` · ${place.city}`:''}</option>)}</select></label></div>
                {userScopeOptions.length===0&&<p className="inline-message error-message" role="status">No locations in your scope match this role. Ask an administrator to set up the location first.</p>}
                <button className="primary-button" disabled={savingManagedUser||userScopeOptions.length===0}>{savingManagedUser?'Saving access…':'Add scoped access'}<span aria-hidden="true">→</span></button>
              </form>
              <section className="panel user-directory-panel">
                <div className="panel-heading"><div><p className="eyebrow">YOUR SCOPE</p><h2>People and roles</h2></div><span className="evidence-count">{managedUsers.filter((person)=>person.isActive).length} active</span></div>
                {managedUsersBusy?<div className="map-loading"><span className="spinner"/>Loading access list…</div>:!managedUsers.length?<div className="empty-state"><Icon name="people"/><strong>No people are assigned in this scope yet.</strong><small>Add a work account to give it a role and location.</small></div>:<div className="managed-user-list">{managedUsers.map((person)=><article className={`managed-user-card ${person.isActive?'':'inactive'}`} key={person.id}><div className="managed-user-heading"><span className="managed-user-avatar">{person.displayName.slice(0,1).toUpperCase()}</span><span><strong>{person.displayName}</strong><small>{person.email}{person.phoneNumber?` · ${person.phoneNumber}`:''}</small></span><span className={`user-state ${person.isActive?'':'paused'}`}>{person.isActive?'Active':'Paused'}</span></div><div className="managed-user-roles">{person.roles.map((grant,index)=><span key={`${person.id}-${grant.role}-${grant.scopeLocationId||index}`}><b>{grant.role.replaceAll('_',' ')}</b><small>{grant.scopeLocationName||'Organization-wide'}</small></span>)}</div><button className="text-button" onClick={()=>void toggleManagedUser(person)}>{person.isActive?'Pause access':'Restore access'}</button></article>)}</div>}
              </section>
            </div>
          </section>}

          {view === 'assets' && <section className="view-panel">
            <p className="eyebrow">ASSET REGISTER</p><div className="view-title-row"><div><h1>Everything accounted for.</h1><p className="view-lead">Search by name, tag, serial number, category, or location.</p></div><div className="inventory-actions">{canExportAssets&&!DEMO_MODE&&<button className="quiet-button" onClick={()=>setView('exports')}>Export register</button>}<button className="quiet-button" onClick={() => setView('scanner')}>Scan code</button><button className="primary-button add-button" onClick={startNewAsset}><Icon name="plus" /> Add asset</button></div></div>
            <div className="inventory-toolbar"><label className="search-box"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, QR tag, serial or centre" /></label><label className="status-filter">Status<select value={assetStatusFilter} onChange={(event)=>setAssetStatusFilter(event.target.value)}><option value="">All assets</option><option value="unused">Unused · available</option><option value="active">Active</option><option value="in_repair">In repair</option><option value="out_of_service">Out of service</option><option value="missing">Missing</option></select></label><label className="completion-filter"><input type="checkbox" checked={completionOnly} onChange={event=>setCompletionOnly(event.target.checked)}/>Needs purchase details</label><span className="count-label">{assets.length} visible</span></div>
            {completionOnly && <p className="form-hint">Follow-up queue for your assigned locations: fill the missing purchase date, unit price, or seller. Records leave this queue automatically when complete.</p>}<section className="panel inventory-panel"><AssetRows assets={assets} onSelect={(asset) => { setSelectedAsset(asset); setView('asset-detail'); }} empty="No assets match that search." />{assetCursor&&<button className="quiet-button load-more-button" onClick={()=>void loadMoreAssets()} disabled={loadingMoreAssets}>{loadingMoreAssets?'Loading records…':'Load more assets'}</button>}</section>
          </section>}

          {view === 'exports' && canExportAssets && !DEMO_MODE && <section className="view-panel exports-view">
            <button className="back-action" onClick={()=>setView('assets')}>← Back to assets</button>
            <p className="eyebrow">CONTROLLED DATA · EXPORTS</p>
            <div className="view-title-row"><div><h1>Prepare a scoped register.</h1><p className="view-lead">Large CSV files are built in the background and stay private to your account.</p></div></div>
            <div className="exports-layout">
              <form className="panel entry-form export-request-form" onSubmit={(event)=>void createAssetExport(event)}>
                <p className="eyebrow">NEW EXPORT</p><h2>Choose what to include.</h2>
                <label>Location scope<select value={exportScopeChoice} onChange={(event)=>setExportScopeChoice(event.target.value)} required={!canExportOrganization}>
                  {canExportOrganization?<option value="">Entire organization</option>:<option value="" disabled>Choose a location</option>}
                  {locations.map((place)=><option key={place.id} value={place.id}>{place.kind.replaceAll('_',' ')} · {place.name}{place.city?` · ${place.city}`:''}</option>)}
                </select><small>{canExportOrganization?'Organization-wide exports include every location.':'Select a location in your assigned scope; its descendants are included.'}</small></label>
                <label>Asset status<select value={exportStatusChoice} onChange={(event)=>setExportStatusChoice(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="unused">Unused</option><option value="in_repair">In repair</option><option value="out_of_service">Out of service</option><option value="missing">Missing</option><option value="retired">Retired</option><option value="disposed">Disposed</option></select></label>
                <label>Search within those assets<input value={exportSearchChoice} onChange={(event)=>setExportSearchChoice(event.target.value)} maxLength={120} placeholder="Tag, name, serial, model, or location" /></label>
                <p className="export-privacy-note">Includes asset identity, location, status, purchase, and seller fields. The file link expires after 5 minutes; the export is removed after 7 days.</p>
                <button className="primary-button" disabled={saving||(!canExportOrganization&&!exportScopeChoice)}>{saving?'Queueing export…':'Prepare private CSV'}<span aria-hidden="true">→</span></button>
              </form>
              <section className="panel export-jobs-panel">
                <div className="panel-heading"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Export history</h2></div>{exportsBusy&&<span className="spinner" aria-label="Refreshing export status"/>}</div>
                {!assetExports.length?<div className="empty-state"><Icon name="history"/><strong>No exports requested yet.</strong><small>Ready files will appear here with their expiry time.</small></div>:<div className="export-job-list">{assetExports.map((job)=><article className="export-job-card" key={job.id}>
                  <div className="export-job-heading"><span><strong>Asset register</strong><small>{job.scopeLocationName||'Entire organization'}{job.filters.status?` · ${job.filters.status.replaceAll('_',' ')}`:''}{job.filters.search?` · “${job.filters.search}”`:''}</small></span><span className={`status-chip export-status-${job.status}`}>{job.status.replaceAll('_',' ')}</span></div>
                  <p>{job.status==='running'?`${job.processedRows.toLocaleString('en-IN')} assets processed · preparing file`:job.status==='queued'?'Waiting for the export worker':job.status==='completed'?`${job.processedRows.toLocaleString('en-IN')} assets · ${formatBytes(job.resultBytes||0)}`:job.status==='failed'?exportFailureMessage(job.failureCode):job.status==='expired'?'The private file has expired. Request a new export.':'This queued export was cancelled.'}</p>
                  <small>Requested {new Date(job.createdAt).toLocaleString('en-IN')}{job.expiresAt?` · File expires ${new Date(job.expiresAt).toLocaleString('en-IN')}`:''}</small>
                  <div className="export-job-actions">{job.status==='queued'&&<button className="text-button" onClick={()=>void cancelAssetExport(job)}>Cancel</button>}{job.status==='completed'&&<button className="primary-button" onClick={()=>void downloadAssetExport(job)}>Download CSV</button>}</div>
                </article>)}</div>}
              </section>
            </div>
          </section>}

          {view === 'asset-form' && <section className="view-panel narrow-view">
            <button className="back-action" onClick={() => setView(selectedAsset ? 'asset-detail' : 'assets')}>← Back to {selectedAsset ? 'asset' : 'register'}</button><p className="eyebrow">{selectedAsset ? 'ASSET RECORD · EDIT' : 'NEW ASSET · REGISTER'}</p><h1>{selectedAsset ? 'Keep this record up to date.' : 'Capture it. Confirm it. Save it.'}</h1><p className="view-lead">Start with a photo or invoice. Only name, category, and location are required; the rest can be completed later.</p>
            <form key={`${selectedAsset?.id || 'new'}-${formSeedVersion}`} ref={registrationForm} className="panel entry-form asset-form" onSubmit={createAsset} onInvalidCapture={event => {const details=(event.target as HTMLElement).closest('details');if(details)details.open=true;setError('Please complete the required fields and check the highlighted field.');}}>
              <div className="form-section-title"><span>01</span><div><h2>Identify the item</h2><small>Name and category are required.</small></div></div>
              <div className="capture-grid">
                <label className="capture-tile"><span className="capture-glyph"><Icon name="asset" /></span><strong>{assetPhotoFile ? 'Retake product photo' : 'Photograph the asset'}</strong><small>Suggest a common item type, read its label, and compare with registered photos</small><input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setAssetPhotoFile(file); setAssetPhotoUrl(URL.createObjectURL(file)); setAssetCaptureSuggestions(null); setMatchingAssets([]); setMatchingConfidence(null); void analyzeCapture(file, 'asset'); }} /></label>
                <label className="capture-tile"><span className="capture-glyph"><Icon name="asset" /></span><strong>{invoiceFile ? 'Choose another invoice' : 'Scan purchase invoice'}</strong><small>Extract seller, date, amount, and product clues</small><input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSharedInvoice(null); setInvoiceFile(file); setInvoiceCaptureSuggestions(null); void analyzeCapture(file, 'invoice'); } }} /></label>
              </div>
              {assetPhotoUrl && <img className="capture-preview" src={assetPhotoUrl} alt="Captured asset for review" />}
              {assetPhotoFile && !photoClassifierReady && <section className="photo-ai-setup"><div><strong>Suggest a product type from this photo</strong><small>Recognizes common office items on this device. A one-time download of about 18 MB makes it available offline.</small></div><button type="button" className="quiet-button" disabled={photoClassifierLoading || captureBusy} onClick={() => void preparePhotoSuggestions()}>{photoClassifierLoading ? 'Preparing…' : 'Prepare photo suggestions'}</button></section>}
              {photoClassifierLoading && <div className="capture-progress" role="status"><span style={{ width: `${photoClassifierProgress}%` }} /><small>{photoClassifierStage || 'Preparing photo recognition'}{photoClassifierProgress ? ` · ${photoClassifierProgress}%` : ''}</small></div>}
              {assetPhotoFile && photoClassifierReady && !photoClassifierLoading && <p className="photo-ai-ready" role="status">On-device photo suggestions are ready for this capture. Review the model guess before using it.</p>}
              {invoiceFile && <div className="selected-invoice"><span>{invoiceFile.name}</span><button type="button" className="text-button" onClick={() => void analyzeCapture(invoiceFile, 'invoice')}>{captureBusy ? `Reading ${captureProgress}%` : 'Read invoice'}</button></div>}
              {captureBusy && <div className="capture-progress" role="status"><span style={{ width: `${captureProgress}%` }} /><small>Reading this image on your device · {captureProgress}%</small></div>}
              {captureSuggestions && <section className="capture-review" aria-live="polite"><div><p className="eyebrow">SUGGESTIONS TO REVIEW</p><strong>{matchingConfidence === 'exact' ? 'Possible duplicate · compare these records.' : matchingConfidence === 'visual' ? 'Visual look-alikes · compare before adding.' : matchingConfidence === 'similar' ? 'Similar items · compare before adding.' : matchingConfidence === 'photo' ? 'Photo category guess · confirm before saving.' : 'Check these details against the item.'}</strong><small className="visual-privacy-note">Text reading, photo recognition, and image comparison run on this device. Only a compact visual signature is sent to find registered matches.</small></div>{captureSuggestions.photoHint && <p className="photo-hint">Photo model: <strong>{captureSuggestions.photoHint}</strong></p>}<dl>{[['Suggested name',captureSuggestions.name],['Category',captureSuggestions.category],['Brand',captureSuggestions.manufacturer],['Model',captureSuggestions.model],['Serial number',captureSuggestions.serialNumber],['Seller',captureSuggestions.sellerName],['Invoice date',captureSuggestions.purchaseDate],['Invoice amount',captureSuggestions.purchaseAmount && `₹${captureSuggestions.purchaseAmount}`],['Invoice number',captureSuggestions.invoiceReference]].filter(([,value]) => value).map(([label,value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{matchingAssets.map((asset) => <button type="button" className="possible-match" key={asset.id} onClick={() => { setSelectedAsset(asset); setView('asset-detail'); }}><Icon name="asset" /><span><strong>{asset.name}</strong><small>{asset.assetTag} · {asset.locationName}{asset.similarityPercent!==undefined?` · ${asset.similarityPercent}% visual similarity`:''}</small></span><Icon name="arrow" /></button>)}{!selectedAsset && <button type="button" className="text-button" onClick={applyCaptureSuggestions}>Use suggestions in the editable form →</button>}{captureSuggestions.sourceText&&<details><summary>View text read from image</summary><pre>{captureSuggestions.sourceText}</pre></details>}</section>}
          <div className="form-grid"><label>Asset name<input name="name" required maxLength={160} defaultValue={selectedAsset?.name || formSeed?.name || ''} placeholder="e.g. Network switch" /></label><label>Category<input name="category" required maxLength={100} defaultValue={selectedAsset?.category || formSeed?.category || ''} placeholder="e.g. IT equipment" /></label></div>
<div className="quick-templates" aria-label="Common item templates"><span>Start faster</span>{[['general','Other item'],['IT equipment','Laptop / IT'],['Furniture','Chair / furniture'],['Office equipment','Office equipment']].map(([value,label])=><button key={value} type="button" aria-pressed={registrationTemplate===value} onClick={()=>{setRegistrationTemplate(value);const field=registrationForm.current?.elements.namedItem('category');if(field instanceof HTMLInputElement && (!field.value||field.value===registrationTemplate) && value!=='general')field.value=value;}}>{label}</button>)}</div>
              {!selectedAsset&&registrationTemplate==='Furniture'&&<label className="quantity-field">Identical furniture items<input name="quantity" type="number" min="1" max="25" defaultValue="1"/><small>Up to 25 items, each with its own QR. Enter the price per item. The invoice is shared; a captured photo belongs to the first item.</small></label>}
<div className="form-section-title"><span>02</span><div><h2>Give it a location</h2><small>Remembered for this session. Check it before each save.</small></div></div>
              <label>Centre, warehouse, or floor<select name="locationId" required defaultValue={selectedAsset?.locationId || formSeed?.locationId || ''} onChange={event=>{if(organization)rememberLocation(organization.id,event.target.value)}}><option value="" disabled>Select a location</option>{locations.filter(location=>location.kind!=='state').map((location) => <option key={location.id} value={location.id}>{locationPath(locations,location.id)}{location.code ? ` (${location.code})` : ''}</option>)}</select></label>
<div className="form-grid"><label>Ownership<select name="ownershipType" onChange={event=>{setRegistrationOwnership(event.target.value);if(event.target.value==='VENDOR_LEASED'){const field=registrationForm.current?.elements.namedItem('sellerName');if(field instanceof HTMLInputElement){const details=field.closest('details');if(details)details.open=true;}}}} defaultValue={selectedAsset?.ownershipType || formSeed?.ownershipType || 'INCUSPAZE_OWNED'}><option value="INCUSPAZE_OWNED">Incuspaze owned</option><option value="CLIENT_DEDICATED">Client dedicated</option><option value="VENDOR_LEASED">Vendor leased</option><option value="TRIAL_DEMO">Trial or demo</option></select></label><label>Condition<select name="condition" defaultValue={selectedAsset?.condition || 'good'}><option value="good">Good · working</option><option value="fair">Fair · monitor</option><option value="damaged">Damaged</option><option value="not_working">Not working</option></select></label></div>{registrationTemplate==='IT equipment' && <p className="form-hint">For IT equipment, add the serial number in Item details when available. Every saved item gets its own QR.</p>}
<details className="quick-details" open={selectedAsset ? true : undefined}><summary>Item details <small>Serial number, brand, model, RFID and status</small></summary><div className="form-grid"><label>Asset tag <small>Optional · assigned if blank</small><input name="assetTag" maxLength={40} defaultValue={selectedAsset?.assetTag || ''} placeholder="e.g. IT-00482" /></label><label>Serial number<input name="serialNumber" maxLength={120} defaultValue={selectedAsset?.serialNumber || formSeed?.serialNumber || ''} placeholder="Manufacturer serial number" /></label><label>Manufacturer<input name="manufacturer" maxLength={120} defaultValue={selectedAsset?.manufacturer || formSeed?.manufacturer || ''} placeholder="Brand or manufacturer" /></label><label>Model<input name="model" maxLength={120} defaultValue={selectedAsset?.model || formSeed?.model || ''} placeholder="Model name or number" /></label>{selectedAsset && <label>Record status<select name="status" defaultValue={selectedAsset?.status || 'active'} onChange={(event)=>setAssetStatusChoice(event.target.value)}><option value="active">Active</option><option value="unused">Unused · available for transfer</option><option value="in_repair">In repair</option><option value="out_of_service">Out of service</option><option value="missing">Missing</option><option value="retired">Retired</option><option value="disposed">Disposed</option></select></label>}</div>
              <label>UHF RFID EPC <small>Optional · bind an EPC read from the physical tag. This form does not write the chip.</small><input name="rfidEpc" maxLength={64} pattern="(?:[A-Fa-f0-9]{2}){4,32}" defaultValue={selectedAsset?.rfidEpc || ''} placeholder="Hexadecimal EPC from the selected reader" autoCapitalize="characters" /></label>
              {selectedAsset?.rfidEpc&&<label>RFID tag change reason <small>Required only when replacing or removing this tag. The retired EPC stays reserved.</small><textarea name="rfidChangeReason" minLength={5} maxLength={500} rows={2} placeholder="e.g. Tag damaged during service; replaced and read back" /></label>}
              {needsStatusReason&&<label className="status-change-reason">Why is this status changing?<small>A reason is required for a missing, retired, or disposed classification.</small><textarea name="statusChangeReason" minLength={5} maxLength={500} required rows={2} placeholder="Record what was checked and who confirmed the status." /></label>}
</details>
<details className="quick-details" open={selectedAsset ? true : undefined}><summary>Purchase and notes <small>Optional now · complete later</small></summary>              <div className="form-section-title"><span>03</span><div><h2>Purchase record</h2><small>Enter the price for this item, not the total of a multi-item invoice.</small></div></div>
              <div className="form-grid"><label>Purchase date<input name="purchaseDate" type="date" defaultValue={selectedAsset?.purchaseDate || formSeed?.purchaseDate || ''} /></label><label>Price per item (₹)<input name="purchaseAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={selectedAsset?.purchaseAmount || formSeed?.purchaseAmount || ''} placeholder="0.00" /></label><label>Seller / leasing vendor<input name="sellerName" required={registrationOwnership==='VENDOR_LEASED'} maxLength={160} defaultValue={selectedAsset?.sellerName || formSeed?.sellerName || ''} placeholder="Seller or supplier" /></label><label>Seller phone<input name="sellerPhone" type="tel" maxLength={40} defaultValue={selectedAsset?.sellerPhone || formSeed?.sellerPhone || ''} placeholder="Contact number" /></label></div>
              <label>Notes<textarea name="notes" defaultValue={selectedAsset?.notes || formSeed?.notes || ''} rows={3} maxLength={2000} placeholder="Anything the next custodian should know" /></label>
</details>
{sharedInvoice && <div className="shared-invoice"><Icon name="asset"/><span><strong>Reuse purchase invoice</strong><small>{sharedInvoice.name} · linked to this item when saved</small></span><button type="button" className="text-button" onClick={()=>setSharedInvoice(null)}>Remove</button></div>}
              <div className="form-hint"><Icon name="asset" /><span>Photo and invoice details are suggestions. Review them in the form before saving; the original captures stay attached to the asset record.</span></div>
              {createdCopies.length>0 && <p role="status" className="form-hint">{createdCopies.length} item(s) saved. If interrupted, retry this unchanged form to continue without duplicates.</p>}
              {error && <p className="capture-error" role="alert">{error}</p>}
              <div className="form-actions"><button type="button" className="quiet-button" onClick={() => setView(selectedAsset ? 'asset-detail' : 'assets')}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving asset…' : selectedAsset ? 'Save changes' : 'Save asset & create QR'}<span aria-hidden="true">→</span></button>{!selectedAsset&&<button type="submit" className="quiet-button" name="saveIntent" value="add-next" disabled={saving}>Save & add similar</button>}</div>
            </form>
          </section>}

          {view === 'scanner' && <>{verificationScanCycleId && <div className="scan-location-choice"><label>Where are you checking?<select value={scanLocationId} onChange={(event)=>setScanLocationId(event.target.value)}><option value="">Use asset’s current register location</option>{locations.map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}</option>)}</select></label></div>}<CodeScanner onCode={(code) => void (verificationScanCycleId ? recordCycleScan(code) : findScannedCode(code))} onClose={() => {setVerificationScanCycleId(null);setView(verificationScanCycleId?'verify':'assets');}} /></>}

          {view === 'asset-detail' && selectedAsset && <section className="view-panel narrow-view"><button className="back-action" onClick={() => setView('assets')}>← Back to register</button><p className="eyebrow">{selectedAsset.category.toUpperCase()} · {selectedAsset.assetTag}</p><div className="detail-title-row"><div><h1>{selectedAsset.name}</h1><p className="view-lead">{selectedAsset.locationName} · {selectedAsset.serialNumber || 'No serial number recorded'}</p></div><div className="detail-actions">{canWriteAssets&&<button className="quiet-button" onClick={() => { setFormSeed(null); setAssetCaptureSuggestions(null); setInvoiceCaptureSuggestions(null); setAssetStatusChoice(selectedAsset.status); setRegistrationOwnership(selectedAsset.ownershipType); setView('asset-form'); }}>Edit record</button>}{canWriteAssets&&<button className="primary-button add-button" onClick={() => setView('qr-label')}>View QR label</button>}</div></div>{missingAssetDetails(selectedAsset).length>0 && <div className="completion-note"><strong>Details to complete</strong><span>{missingAssetDetails(selectedAsset).join(' · ')}</span><button className="text-button" onClick={()=>{setFormSeed(null);setAssetStatusChoice(selectedAsset.status);setRegistrationOwnership(selectedAsset.ownershipType);setView('asset-form');}}>Complete details →</button></div>}<section className="panel detail-panel"><div className="detail-grid"><Detail label="Status" value={selectedAsset.status.replaceAll('_',' ')} /><Detail label="Condition" value={selectedAsset.condition.replaceAll('_',' ')} /><Detail label="Ownership" value={selectedAsset.ownershipType.replaceAll('_',' ').toLowerCase()} /><Detail label="Manufacturer" value={selectedAsset.manufacturer || 'Not recorded'} /><Detail label="Model" value={selectedAsset.model || 'Not recorded'} /><Detail label="UHF RFID EPC" value={selectedAsset.rfidEpc || 'Not assigned'} /><Detail label="Purchase date" value={selectedAsset.purchaseDate || 'Not recorded'} /><Detail label="Purchase amount" value={selectedAsset.purchaseAmount ? `₹${Number(selectedAsset.purchaseAmount).toLocaleString('en-IN')}` : 'Not recorded'} /><Detail label="Seller" value={selectedAsset.sellerName || 'Not recorded'} /><Detail label="Opaque QR identity" value={selectedAsset.qrPublicId} /></div></section>
            <section className="panel custody-panel"><div className="panel-heading"><div><p className="eyebrow">WHO HAS IT NOW?</p><h2>Custody & handover</h2></div><span className="evidence-count">{activeCustody?'Issued':'Available'}</span></div><p className="custody-intro">Record who takes responsibility for this item, its condition at handover, and when it comes back.</p>{DEMO_MODE?<div className="empty-state custody-empty"><strong>Custody tracking is available in the live register.</strong><small>Sign in to issue an item and keep a handover history.</small></div>:activeCustody?<><div className="custody-active"><span className="custody-person-mark">{activeCustody.custodianName.slice(0,1).toUpperCase()}</span><span><strong>{activeCustody.custodianName}</strong><small>Issued {new Date(activeCustody.issuedAt).toLocaleString('en-IN')} · {activeCustody.issueCondition.replaceAll('_',' ')}</small>{activeCustody.issueNotes&&<small>{activeCustody.issueNotes}</small>}</span></div><form className="custody-form return-custody-form" onSubmit={(event)=>void returnAssetCustody(event,activeCustody)}><label>Condition on return<select name="condition" defaultValue="good"><option value="good">Good · working</option><option value="fair">Fair · monitor</option><option value="damaged">Damaged</option><option value="not_working">Not working</option></select></label><label>Return notes<input name="notes" maxLength={2000} placeholder="Condition, accessories, or discrepancy"/></label><button className="quiet-button" disabled={saving}>{saving?'Saving return…':'Record return'}</button></form></>:eligibleCustodians.length?<form className="custody-form" onSubmit={issueAssetCustody}><label>Issue to<select name="custodianUserId" defaultValue="" required><option value="" disabled>Choose an assigned custodian</option>{eligibleCustodians.map((person)=><option value={person.userId} key={person.userId}>{person.displayName}</option>)}</select></label><label>Condition at handover<select name="condition" defaultValue="good"><option value="good">Good · working</option><option value="fair">Fair · monitor</option><option value="damaged">Damaged</option><option value="not_working">Not working</option></select></label><label>Handover note<input name="notes" maxLength={2000} placeholder="Accessories, location, or purpose"/></label><button className="primary-button" disabled={saving}>{saving?'Recording…':'Issue to custodian'}</button></form>:<div className="empty-state custody-empty"><strong>No eligible custodians are assigned here yet.</strong><small>An organization administrator needs to assign an asset custodian to this centre.</small></div>}{custodyHistory.filter((item)=>item.returnedAt).length>0&&<div className="custody-history"><h3>Previous handovers</h3>{custodyHistory.filter((item)=>item.returnedAt).slice(0,5).map((item)=><article key={item.custodyId}><span><strong>{item.custodianName}</strong><small>Issued {new Date(item.issuedAt).toLocaleDateString('en-IN')} · returned {item.returnedAt?new Date(item.returnedAt).toLocaleDateString('en-IN'):''}</small></span><small>{item.issueCondition.replaceAll('_',' ')} → {item.returnCondition?.replaceAll('_',' ')}</small></article>)}</div>}</section>
            <section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACCOUNTABILITY TRAIL</p><h2>Asset activity</h2></div><span className="evidence-count">{assetActivity.length} events</span></div>{assetActivity.length?<ol className="activity-timeline">{assetActivity.map((event)=><li key={event.id}><span className="activity-node"><Icon name="history"/></span><div className="activity-copy"><strong>{activityTitle(event.eventType)}</strong><p>{activitySummary(event)}</p><small>{event.actorName} · {new Date(event.occurredAt).toLocaleString('en-IN')}</small></div></li>)}</ol>:<div className="empty-state activity-empty"><strong>No activity has been recorded yet.</strong><small>Scans, handovers, reports, transfers, and record changes will appear here.</small></div>}</section>
            <section className="panel warranty-panel"><div className="panel-heading"><div><p className="eyebrow">COVERAGE WATCH</p><h2>Warranty and service</h2></div><span className="evidence-count">{warranties.length} records</span></div>{warranties.map((warranty)=><article className="warranty-row" key={warranty.id}><span className="warranty-mark"><Icon name="check"/></span><span><strong>{warranty.coverageKind.toUpperCase()} · {warranty.provider||'Provider not listed'}</strong><small>{warranty.startsOn||'Start not recorded'} — {warranty.endsOn||'No end date'}{warranty.servicePhone?` · Service ${warranty.servicePhone}`:''}</small></span></article>)}{!warranties.length&&<p className="evidence-empty">No warranty or service coverage recorded yet.</p>}<form className="warranty-create" onSubmit={createWarrantyRecord}><label>Coverage<select name="coverageKind" defaultValue="warranty"><option value="warranty">Warranty</option><option value="guarantee">Guarantee</option><option value="amc">Annual maintenance</option><option value="other">Other</option></select></label><label>Seller or service provider<input name="provider" maxLength={160} defaultValue={selectedAsset.sellerName||''} placeholder="Provider name"/></label><label>Service centre phone<input name="servicePhone" type="tel" maxLength={40} placeholder="Support number"/></label><label>Coverage ends<input name="endsOn" type="date"/></label><button className="quiet-button" disabled={saving}>{saving?'Saving…':'Add coverage'}</button></form></section>
            {sharedInvoice?.targetAssetId===selectedAsset.id && <div className="shared-invoice"><span>Invoice link pending: {sharedInvoice.name}</span><button type="button" className="text-button" onClick={async()=>{if(!user||!organization)return;try{if(DEMO_MODE){const file=await readDemoEvidence(sharedInvoice.sourceAssetId,sharedInvoice.evidenceId);await saveDemoEvidence(selectedAsset.id,{id:sharedInvoice.linkId,kind:'invoice',name:sharedInvoice.name,contentType:file.type,file});setEvidence(await listDemoEvidence(selectedAsset.id));}else{await api.linkInvoice(user.accessToken,organization.id,selectedAsset.id,sharedInvoice);setEvidence(await api.evidence(user.accessToken,organization.id,selectedAsset.id));}setSharedInvoice(null);setError('');setNotice('Invoice linked to this asset.');}catch(reason){setError(errorMessage(reason));}}}>Retry invoice link</button></div>}<section className="panel evidence-panel"><div className="panel-heading"><div><p className="eyebrow">PRIVATE ASSET RECORD</p><h2>Photos and documents</h2></div><span className="evidence-count">{evidence.length} saved</span></div><p className="evidence-intro">{DEMO_MODE ? 'Demo attachments are saved on this browser only. They are not uploaded to the organization’s private storage.' : 'Keep the product photo and purchase proof with this item. Only people with access to this asset can open them.'}</p><div className="evidence-add-actions"><label className="quiet-button evidence-picker">Take asset photo<input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addEvidenceFile('asset_photo', file); event.currentTarget.value = ''; }} /></label><label className="quiet-button evidence-picker">Add invoice<input type="file" accept="image/*,application/pdf" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addEvidenceFile('invoice', file); event.currentTarget.value = ''; }} /></label></div>{evidenceError && <div className="inline-message error-message" role="alert">{evidenceError}</div>}{pendingEvidenceFiles.length > 0 && <div className="pending-evidence" role="status"><span>{pendingEvidenceFiles.length} capture{pendingEvidenceFiles.length === 1 ? '' : 's'} {DEMO_MODE ? 'await browser save' : 'need upload'}</span><button className="text-button" disabled={uploadingEvidence} onClick={() => void uploadEvidenceFiles(selectedAsset.id, pendingEvidenceFiles).catch(() => {})}>{uploadingEvidence ? 'Saving…' : DEMO_MODE ? 'Save attachments locally' : 'Retry upload'}</button>{pendingEvidenceFiles.map((item) => <small key={item.id}>{item.name}</small>)}</div>}{evidence.length > 0 ? <div className="evidence-list">{evidence.map((item) => <article className="evidence-row" key={item.id}><span className="evidence-type"><Icon name={item.kind === 'invoice' ? 'asset' : 'pin'} /></span><span><strong>{item.kind === 'invoice' ? 'Purchase invoice' : 'Asset photo'}</strong><small>{item.originalName} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</small></span><button className="text-button" onClick={() => void downloadEvidenceFile(item)}>Open file ↗</button></article>)}</div> : !pendingEvidenceFiles.length && <p className="evidence-empty">No photos or documents attached yet.</p>}</section>
          </section>}

          {view === 'qr-label' && selectedAsset && <section className="view-panel narrow-view label-view"><button className="back-action no-print" onClick={() => setView('asset-detail')}>← Back to asset</button><p className="eyebrow no-print">ASSET REGISTER · QR LABEL</p><h1 className="no-print">Print the asset’s identity.</h1><p className="view-lead no-print">Print the QR code with the asset name, tag, centre, and unique ID.</p>{createdCopies.length>1 && createdCopies.some(item=>item.id===selectedAsset.id) && <div className="batch-labels no-print"><strong>{createdCopies.length} individual labels</strong>{createdCopies.map((asset,index)=><button type="button" className="quiet-button" key={asset.id} aria-pressed={selectedAsset.id===asset.id} onClick={()=>setSelectedAsset(asset)}>{index+1} · {asset.assetTag}</button>)}</div>}{pendingInvoiceLinks.length>0 && <div className="shared-invoice no-print"><span>{saving ? 'Linking invoices…' : `${pendingInvoiceLinks.length} invoice links need retry. Finish any pending upload on the first item, then retry.`}</span><button type="button" className="text-button" disabled={saving} onClick={async()=>{setSaving(true);try{for(const link of pendingInvoiceLinks){await saveInvoiceLink(link);setPendingInvoiceLinks(current=>current.filter(item=>item.linkId!==link.linkId));}setError('');setNotice('Invoices linked to all items.');}catch(reason){setError(errorMessage(reason));}finally{setSaving(false);}}}>Retry invoice links</button></div>}<div className="qr-label">{qrImage ? <img className="qr-image" src={qrImage} alt={`Signed QR code for ${selectedAsset.assetTag}`} /> : <div className="qr-placeholder" aria-label="Preparing QR code" />}<strong className="qr-item-name">{selectedAsset.name}</strong><span className="qr-tag">{selectedAsset.assetTag}</span><small className="qr-location">{selectedAsset.locationName}</small><small className="qr-id">{selectedAsset.qrPublicId}</small></div><button type="button" className="quiet-button no-print" disabled={saving} onClick={()=>void addSimilarAsset()}>Add another like this</button><button className="primary-button print-button no-print" disabled={!qrImage || saving} onClick={() => window.print()}>Print label <span aria-hidden="true">↗</span></button><p className="no-print privacy-copy">One 80 × 110 mm label. In the print dialog, turn off Headers and footers to remove the browser’s date and page address.</p></section>}
        </section>
      </div>
    </main>
  );
}

function downloadRfidExceptions(summary:RfidBatchSummary) {
  const exceptions=summary.results.filter((item)=>item.status==='wrong_location'||item.status==='not_registered');
  if(!exceptions.length)return;
  const escape=(value:string)=>`"${value.replaceAll('"','""')}"`;
  const rows=[['EPC','Review result','Asset tag','Registered place'],...exceptions.map((item)=>[
    item.epc,item.status==='wrong_location'?'Assigned to another place':'No asset matched in this user scope',item.assetTag||'',item.assignedLocation||'',
  ])];
  const blob=new Blob([`\uFEFF${rows.map((row)=>row.map(escape).join(',')).join('\r\n')}`],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`rfid-review-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function RfidBatchAudit({ locations, selectedLocationId, onLocationChange, text, onTextChange, parsed, busy, closed, summary, onSubmit }: {
  locations: Location[];
  selectedLocationId: string;
  onLocationChange: (value: string) => void;
  text: string;
  onTextChange: (value: string) => void;
  parsed: ReturnType<typeof parseRfidBatchText>;
  busy: boolean;
  closed: boolean;
  summary: RfidBatchSummary | null;
  onSubmit: () => void;
}) {
  return <section className="rfid-bulk-entry" aria-labelledby="rfid-bulk-title">
    <div className="rfid-bulk-heading"><div><p className="eyebrow">UHF RFID · FLOOR AUDIT</p><h3 id="rfid-bulk-title">Reconcile a reader sweep.</h3><p>Import a reader export or paste EPCs, one per line. Reads are matched against this cycle and the selected place.</p></div><span className="rfid-bulk-mark" aria-hidden="true"><Icon name="asset" /></span></div>
    <div className="rfid-bulk-controls"><label>Where did you scan?<select value={selectedLocationId} onChange={(event)=>onLocationChange(event.target.value)}><option value="">Choose centre, floor, or area</option>{locations.map((place)=><option key={place.id} value={place.id}>{place.kind} · {place.name}</option>)}</select></label><label className="rfid-file-picker">Import reader list<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(event)=>{const input=event.currentTarget;const file=input.files?.[0];if(file)void file.text().then(onTextChange);input.value='';}} /></label></div>
    <label className="rfid-batch-text-label">Reader output <small>One hexadecimal EPC per line. If the export includes RSSI or antenna columns, the EPC must be first.</small><textarea rows={5} value={text} onChange={(event)=>onTextChange(event.target.value)} placeholder={'E2801160600000000000034A\nE2801160600000000000034B'} spellCheck={false} /></label>
    <div className="rfid-batch-meta" aria-live="polite"><span><strong>{parsed.epcs.length.toLocaleString('en-IN')}</strong> unique tags</span>{parsed.duplicateCount>0&&<span>{parsed.duplicateCount.toLocaleString('en-IN')} repeat reads will be collapsed</span>}{parsed.invalidLines.length>0&&<span className="rfid-invalid-count">{parsed.invalidLines.length.toLocaleString('en-IN')} invalid line{parsed.invalidLines.length===1?'':'s'} · check line{parsed.invalidLines.length===1?'':'s'} {parsed.invalidLines.slice(0,3).map((item)=>item.line).join(', ')}{parsed.invalidLines.length>3?'…':''}</span>}</div>
    <button type="button" className="primary-button rfid-batch-submit" disabled={closed||busy||!selectedLocationId||!parsed.epcs.length||parsed.invalidLines.length>0} onClick={onSubmit}>{busy?'Reconciling reader sweep…':`Reconcile ${parsed.epcs.length.toLocaleString('en-IN')} tags`}</button>
    <p className="rfid-hardware-note">This web app accepts reader exports and keyboard-wedge output. Pairing a UHF sled, writing RFID chips, and live signal-strength search require a tested device adapter.</p>
    {summary&&<div className="rfid-batch-result" role="status"><strong>Reader sweep reviewed</strong><span>{summary.recordedCount} matched assets recorded · {summary.duplicateCount+summary.inputDuplicateCount} repeat reads · {summary.wrongLocationCount} assigned elsewhere · {summary.notRegisteredCount} not matched in scope</span>{summary.results.some((item)=>item.status==='wrong_location'||item.status==='not_registered')&&<div className="rfid-batch-exceptions"><strong>Needs a closer look</strong><ul>{summary.results.filter((item)=>item.status==='wrong_location'||item.status==='not_registered').slice(0,8).map((item)=><li key={item.clientEventId}>{item.status==='wrong_location'?`${item.assetTag} is registered at ${item.assignedLocation||'another place'}`:`EPC ${item.epc} did not match an asset in this scope`}</li>)}</ul>{summary.results.filter((item)=>item.status==='wrong_location'||item.status==='not_registered').length>8&&<small>Showing the first 8 exceptions.</small>}<button type="button" className="text-button" onClick={()=>downloadRfidExceptions(summary)}>Download all exceptions</button></div>}</div>}
  </section>;
}

function Brand() { return <div className="brand-lockup"><div className="brandmark" aria-hidden="true">i</div><span className="brandname">INCUSPAZE</span><span className="brand-divider" /><span className="product-name">ASSET REGISTER</span></div>; }

function SignIn({ error, configured, onSignIn }: { error: string; configured: boolean; onSignIn: () => void }) {
  return <main className="app-shell"><header className="brandbar"><Brand /></header><section className="signin-layout"><div className="signin-copy"><p className="eyebrow">A CLEARER VIEW OF EVERY ASSET</p><h1>Every place.<br /><em>Every asset.</em><br />Accounted for.</h1><p className="lead">One thoughtful register for every Incuspaze centre across India.</p><div className="signin-note"><span className="fine-rule" />Designed for the people who care for the space.</div></div><section className="signin-card"><div className="signin-card-top"><span className="lock-glyph" aria-hidden="true">⌑</span><span>PRIVATE WORKSPACE</span></div><h2>Welcome back</h2><p>Sign in with your organization account to continue.</p>{error && <div className="message" role="alert">{error}</div>}{configured ? <button className="primary-button" onClick={onSignIn}>Continue with your work account <span aria-hidden="true">→</span></button> : <div className="config-message" role="status"><strong>Sign-in setup in progress</strong><span>Your administrator will connect the organization identity provider before live records are enabled.</span></div>}<small className="privacy-copy">Access is limited by your assigned organization, state, and centre role.</small></section></section><footer className="page-footer"><span>INCUASSET</span><span>ONE REGISTER · EVERY CENTRE</span></footer></main>;
}

function Summary({ label, value, detail }: { label: string; value: number; detail: string }) { return <article className="summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-field"><small>{label}</small><strong>{value}</strong></div>; }

function AssetRows({ assets, onSelect, empty = 'No registered assets yet.' }: { assets: Asset[]; onSelect: (asset: Asset) => void; empty?: string }) {
  if (!assets.length) return <div className="empty-state"><Icon name="asset" /><strong>{empty}</strong><small>Try another search or add an asset to the register.</small></div>;
  return <div className="asset-rows">{assets.map((asset) => <button className="asset-row" key={asset.id} onClick={() => onSelect(asset)}><span className="asset-symbol"><Icon name="asset" /></span><span className="asset-primary"><strong>{asset.name}</strong><small>{asset.assetTag} · {asset.category}</small></span><span className="asset-place">{asset.locationName}</span><span className={`status-chip status-${asset.status}`}>{asset.status.replaceAll('_',' ')}</span><span className="row-arrow"><Icon name="arrow" /></span></button>)}</div>;
}

function LocationRows({ locations, allLocations }: { locations: Location[]; allLocations: Location[] }) {
  if (!locations.length) return <div className="empty-state"><Icon name="pin" /><strong>No locations match.</strong><small>Check the search or add a place to the hierarchy.</small></div>;
  const parentName = (item: Location) => item.parentId ? allLocations.find((parent) => parent.id === item.parentId)?.name || 'Parent location' : 'India';
  return <div className="location-rows">{locations.map((item) => <article className="location-row" key={item.id}><span className={`location-level level-${item.kind}`}><Icon name={item.kind} /></span><span className="location-primary"><strong>{item.name}</strong><small>{item.code || item.kind} · {item.city || item.stateName || parentName(item)}</small></span><span className="location-parent">Within {parentName(item)}</span><span className={`coordinate-state ${item.coordinatesStatus === 'unverified' ? 'unverified' : ''}`}>{item.coordinatesStatus.replaceAll('_',' ')}</span></article>)}</div>;
}

function errorMessage(reason: unknown) {
  if (reason instanceof ApiError) {
    if (reason.status === 401) return 'Your sign-in expired. Sign in again to continue.';
    if (reason.status === 403) return 'Your role does not allow that action or location.';
    return reason.message;
  }
  if (reason instanceof Error) return reason.message;
  return 'Something went wrong. Please try again.';
}
