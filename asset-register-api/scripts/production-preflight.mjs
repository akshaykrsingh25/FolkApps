import {createRequire} from 'node:module';
import {createPrivateKey} from 'node:crypto';
const require=createRequire(import.meta.url);
let failures=0;
function check(name,run){try{run();console.log(`PASS ${name}`);}catch{failures++;console.log(`BLOCKED ${name}`);}}
check('Production API configuration',()=>{require('../dist/src/common/runtime-config.js').validateRuntimeConfiguration({...process.env,NODE_ENV:'production'});});
check('Ed25519 QR signing configuration',()=>{if(!process.env.ASSET_QR_SIGNING_KEY_ID)throw Error();const key=createPrivateKey((process.env.ASSET_QR_SIGNING_PRIVATE_KEY||'').replace(/\\n/g,'\n'));if(key.asymmetricKeyType!=='ed25519')throw Error();});
for(const name of ['VITE_API_BASE_URL','VITE_OIDC_AUTHORITY','VITE_OIDC_REDIRECT_URI','VITE_OIDC_POST_LOGOUT_REDIRECT_URI'])check(`${name} uses HTTPS`,()=>{const url=new URL(process.env[name]||'');if(url.protocol!=='https:'||url.username||url.password)throw Error();});
check('Frontend identity and live mode',()=>{if(!process.env.VITE_OIDC_CLIENT_ID||process.env.VITE_DEMO_MODE!=='false')throw Error();});
console.log('Configuration check only: no credentials printed, no deployment, no database or network connection attempted.');
console.log('Staging access, storage, migrations, recovery, hardware and ERP commissioning still require separate validation.');
process.exitCode=failures?1:0;
