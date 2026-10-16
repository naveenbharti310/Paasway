const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
function load(name,mocks={},extra={}){const m={exports:{}};const source=fs.readFileSync(path.join(__dirname,'../src',name),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:m,exports:m.exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Unexpected dependency '+n)},console,setTimeout,clearTimeout,AbortController,...extra});return m.exports;}
const {withDeadline}=load('services/withDeadline.ts');const {createMessageRetryState}=load('features/chat/messageAttempt.ts');
test('unchanged failed message intent reuses the same retry key',()=>{let n=0;const s=createMessageRetryState(()=>`key-${++n}`);assert.equal(s.forMessage('c','hello').clientMessageId,s.forMessage('c','hello').clientMessageId);assert.equal(n,1);});
test('changing content, connection or reply creates a fresh message intent',()=>{let n=0;const s=createMessageRetryState(()=>`key-${++n}`);const keys=[s.forMessage('c','hello'),s.forMessage('c','changed'),s.forMessage('d','changed'),s.forMessage('d','changed','reply')].map(v=>v.clientMessageId);assert.equal(new Set(keys).size,4);});
test('acknowledging an earlier send cannot clear a later draft intent',()=>{let n=0;const s=createMessageRetryState(()=>`key-${++n}`);const a=s.forMessage('c','a'),b=s.forMessage('c','b');s.delivered(a.clientMessageId);assert.equal(s.forMessage('c','b').clientMessageId,b.clientMessageId);s.delivered(b.clientMessageId);assert.notEqual(s.forMessage('c','b').clientMessageId,b.clientMessageId);});
test('callers cannot mutate the stored retry intent',()=>{const s=createMessageRetryState(()=>'key');const a=s.forMessage('c','hello');a.content='changed';assert.equal(s.forMessage('c','hello').content,'hello');});
test('deadline aborts stalled network work and gives a safe error code',async()=>{let signal;await assert.rejects(withDeadline(s=>{signal=s;return new Promise(()=>{})},10),e=>e.code==='functions/deadline-exceeded');assert.equal(signal.aborted,true);});
test('successful operations clear their deadline without later abort',async()=>{let signal;assert.equal(await withDeadline(async s=>{signal=s;return 42},10),42);await new Promise(r=>setTimeout(r,20));assert.equal(signal.aborted,false);});
function phoneHarness({fetch,getToken=async()=>({token:'appcheck-test'}),appCheckOff=true,customSignIn}={}){let fallback=0,custom=0;const module=load('features/auth/api/phoneAuth.ts',{'react-native':{NativeModules:{}},'@react-native-firebase/auth':{signInWithPhoneNumber:()=>{fallback++;throw Error('unexpected Firebase SMS')},signInWithCustomToken:async(_auth,t)=>{assert.equal(t,'custom-token-test');custom++;return customSignIn?customSignIn():{user:{uid:'test-user'}}}},'@react-native-firebase/app-check':{getToken},'../../../firebase/client':{auth:{settings:{}},appCheck:{}},'../../../services/withDeadline':{withDeadline:work=>withDeadline(work,20)}},{process:{env:{EXPO_PUBLIC_OTP_PROVIDER:'2factor',EXPO_PUBLIC_API_URL:'https://api.test',EXPO_PUBLIC_APP_CHECK:appCheckOff?'off':'on'}},fetch});return {...module,stats:()=>({fallback,custom})};}
test('actual OTP adapter uses 2Factor backend and custom token, never Firebase SMS',async()=>{const calls=[];const h=phoneHarness({fetch:async(url,o)=>{calls.push({url,o});return new Response(JSON.stringify({result:url.endsWith('otpSend')?{challengeId:'test-challenge'}:{token:'custom-token-test'}}))}});const confirm=await h.beginPhoneSignIn('+919876543210');await confirm.confirm('123456');assert.equal(calls.length,2);assert.ok(calls.every(x=>x.o.signal instanceof AbortSignal));assert.deepEqual(h.stats(),{fallback:0,custom:1});});
test('provider failure never falls back to chargeable Firebase SMS',async()=>{const h=phoneHarness({fetch:async()=>new Response('{"error":{"message":"SMS unavailable"}}',{status:503})});await assert.rejects(h.beginPhoneSignIn('+919876543210'),/SMS unavailable/);assert.equal(h.stats().fallback,0);});
test('stalled OTP requests are bounded and never automatically resent',async()=>{let sends=0;const h=phoneHarness({fetch:async()=>{sends++;return new Promise(()=>{})}});await assert.rejects(h.beginPhoneSignIn('+919876543210'),e=>e.code==='functions/deadline-exceeded');assert.equal(sends,1);});
test('late App Check completion cannot send an SMS after the UI deadline',async()=>{let resolve,sends=0;const token=new Promise(r=>{resolve=r});const h=phoneHarness({appCheckOff:false,getToken:()=>token,fetch:async()=>{sends++;throw Error('must not send')}});await assert.rejects(h.beginPhoneSignIn('+919876543210'),e=>e.code==='functions/deadline-exceeded');resolve({token:'late'});await new Promise(r=>setImmediate(r));assert.equal(sends,0);});
test('user-facing billing errors do not disclose diagnostic credentials',()=>{const {errorMessage}=load('services/errors.ts');const msg=errorMessage(Object.assign(new Error('billing'),{code:'auth/billing-not-enabled'}),'fallback');assert.doesNotMatch(msg,/123456|99999|test number/i);});


test('native location acquisition cannot hold the connection form indefinitely',async()=>{
 let requestedMs;
 const {getCurrentLocation}=load('services/location.ts',{'expo-location':{getForegroundPermissionsAsync:async()=>({status:'granted'}),requestForegroundPermissionsAsync:async()=>({status:'granted'}),Accuracy:{Balanced:3},getCurrentPositionAsync:()=>new Promise(()=>{})},'./withDeadline':{withDeadline:(work,ms)=>{requestedMs=ms;return withDeadline(work,10)}}});
 await assert.rejects(getCurrentLocation(),e=>e.code==='functions/deadline-exceeded');assert.equal(requestedMs,15000);
});
test('denied location permission never requests a position',async()=>{
 let calls=0;const {getCurrentLocation}=load('services/location.ts',{'expo-location':{getForegroundPermissionsAsync:async()=>({status:'denied',canAskAgain:true}),requestForegroundPermissionsAsync:async()=>({status:'denied'}),Accuracy:{Balanced:3},getCurrentPositionAsync:async()=>{calls++}},'./withDeadline':{withDeadline}});
 await assert.rejects(getCurrentLocation(),/Location access/);assert.equal(calls,0);
});


function buildConfig(env){return load('../app.config.ts',{fs:{existsSync:()=>true},child_process:{execSync(){throw Error('unexpected build execution')}}},{process:{env}});}
test('Android release configuration disables backup and unnecessary overlay/storage access',()=>{
 const config=buildConfig({EAS_BUILD_PROFILE:'play-attestation',EXPO_PUBLIC_APP_CHECK:'on'}).default;
 assert.equal(config.android.allowBackup,false);
 for(const permission of ['android.permission.SYSTEM_ALERT_WINDOW','android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE'])assert.ok(config.android.blockedPermissions.includes(permission));
 assert.ok(config.plugins.includes('./plugins/withAndroidDataProtection'));
});
test('production build refuses an inherited App Check bypass',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_APP_CHECK:'off'}),/must not disable App Check/);});
test('production defaults keep App Check on',()=>{assert.equal(buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_OTP_PROVIDER:'2factor'}).default.name,'Passway');});
test('diagnostic bypass stays restricted to the explicit internal profile',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_DIAGNOSTICS:'1'}),/restricted/);assert.equal(buildConfig({EAS_BUILD_PROFILE:'play-diagnostics',EXPO_PUBLIC_DIAGNOSTICS:'1',EXPO_PUBLIC_APP_CHECK:'off'}).default.name,'Passway');});
test('a misspelled SMS provider cannot silently select another provider',()=>{assert.throws(()=>buildConfig({EXPO_PUBLIC_OTP_PROVIDER:'2factro'}),/must be firebase or 2factor/);});


test('the actual verification adapter bounds a stalled native Firebase exchange',async()=>{
 const h=phoneHarness({fetch:async url=>new Response(JSON.stringify({result:url.endsWith('otpSend')?{challengeId:'test-challenge'}:{token:'custom-token-test'}})),customSignIn:()=>new Promise(()=>{})});
 const c=await h.beginPhoneSignIn('+919876543210');await assert.rejects(c.confirm('123456'),e=>e.code==='functions/deadline-exceeded');assert.equal(h.stats().custom,1);assert.equal(h.stats().fallback,0);
});

// Release configuration must fail before Expo bundles public debug credentials.
test('production rejects public App Check debug tokens',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN:'synthetic-debug-token'}),/debug token/i);});
test('attestation profile cannot disable App Check',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'play-attestation',EXPO_PUBLIC_APP_CHECK:'off'}),/must not disable App Check/);});
test('attestation profile rejects public debug tokens',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'play-attestation',EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN:'synthetic-debug-token'}),/debug token/i);});
test('unknown App Check settings fail instead of silently choosing a provider',()=>{assert.throws(()=>buildConfig({EXPO_PUBLIC_APP_CHECK:'OFF'}),/App Check setting/i);});
test('store release profiles reject visible fictional-number helpers',()=>{for(const profile of ['production','play-attestation'])assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:profile,EXPO_PUBLIC_SHOW_TEST_NUMBERS:'1'}),/test number/i);});
test('dedicated store-attestation profile is independent of diagnostic bypass profiles',()=>{const eas=JSON.parse(fs.readFileSync(path.join(__dirname,'../eas.json'),'utf8'));const p=eas.build['play-attestation'];assert.ok(p);assert.equal(p.extends,'production');assert.equal(p.distribution,'store');assert.equal(p.android.buildType,'app-bundle');assert.equal(p.env.EXPO_PUBLIC_APP_CHECK,'on');assert.equal(p.env.EXPO_PUBLIC_DIAGNOSTICS,'0');assert.equal(eas.submit['play-attestation'].android.track,'internal');assert.equal(eas.submit['play-attestation'].android.releaseStatus,'draft');});
test('attestation configuration is valid with verification enabled',()=>{assert.equal(buildConfig({EAS_BUILD_PROFILE:'play-attestation',EXPO_PUBLIC_APP_CHECK:'on',EXPO_PUBLIC_DIAGNOSTICS:'0',EXPO_PUBLIC_SHOW_TEST_NUMBERS:'0'}).default.name,'Passway');});
test('internal development builds may use registered debug credentials',()=>{assert.equal(buildConfig({EAS_BUILD_PROFILE:'development',EXPO_PUBLIC_APP_CHECK:'on',EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN:'synthetic-debug-token'}).default.name,'Passway');});

// RNFirebase 26 callable errors are unprefixed; the web SDK remains prefixed.
const errorBoundary = load('services/errors.ts', {}, { Error });
for (const code of ['not-found', 'failed-precondition', 'invalid-argument', 'permission-denied', 'unauthenticated', 'resource-exhausted', 'unavailable', 'deadline-exceeded', 'internal', 'unknown']) {
 test(`native callable ${code} is namespaced at the callable boundary`, () => {
  const source = Object.assign(new Error('Server-written domain explanation'), { code });
  const normalized = errorBoundary.normalizeCallableError(source);
  assert.equal(normalized.code, `functions/${code}`);
  assert.equal(normalized.message, source.message);
  assert.equal(source.code, code); // Never mutate a shared SDK exception.
  if (code === 'not-found') assert.equal(errorBoundary.errorMessage(normalized, 'fallback'), source.message);
  if (code === 'internal' || code === 'unknown') assert.equal(errorBoundary.errorMessage(normalized, 'fallback'), 'fallback');
 });
}
test('callable normalization preserves already-namespaced and unrelated errors', () => {
 for (const code of ['functions/not-found', 'auth/invalid-verification-code', 'firestore/permission-denied', 'unexpected-provider-code']) {
  const error = Object.assign(new Error('technical details'), { code });
  assert.equal(errorBoundary.normalizeCallableError(error), error);
 }
 for (const error of [null, 'failure', new Error('offline'), { code: 'not-found', message: 'not a real SDK Error' }]) assert.equal(errorBoundary.normalizeCallableError(error), error);
});
test('callable entrypoint normalizes native failures while retaining successful data', async () => {
 const injected = Object.assign(new Error('That code is not active. Ask them to generate a new one.'), { code: 'not-found' });
 const mocks = {
  '@react-native-firebase/app': { getApp: () => ({}) },
  '@react-native-firebase/auth': { getAuth: () => ({}) },
  '@react-native-firebase/firestore': { getFirestore: () => ({}) },
  '@react-native-firebase/functions': { getFunctions: () => ({}), httpsCallable: () => async () => ({ data: { ok: true } }), httpsCallableFromUrl: () => async () => { throw injected; } },
  '@react-native-firebase/app-check': {},
  '../services/errors': errorBoundary,
 };
 const env = { EXPO_PUBLIC_APP_CHECK: 'off', EXPO_PUBLIC_API_URL: 'https://api.test' };
 const external = load('firebase/client.ts', mocks, { Error, process: { env } });
 await assert.rejects(external.callable('redeemTid')({}), error => error.code === 'functions/not-found' && errorBoundary.errorMessage(error, 'fallback') === injected.message);
 const direct = load('firebase/client.ts', mocks, { Error, process: { env: { EXPO_PUBLIC_APP_CHECK: 'off' } } });
 assert.equal((await direct.callable('ok')({})).ok, true);
});

test('every application loading indicator has an explicit accessible name', () => {
 const root = path.join(__dirname, '../src');
 function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
   const file = path.join(dir, entry.name);
   if (entry.isDirectory()) { inspect(file); continue; }
   if (!file.endsWith('.tsx')) continue;
   const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
   function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === 'ActivityIndicator') {
     const label = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(tree) === 'accessibilityLabel');
     assert.ok(label?.initializer && label.initializer.getText(tree).length > 2, `${path.relative(root, file)}: unnamed progress indicator`);
    }
    ts.forEachChild(node, visit);
   }
   visit(tree);
  }
 }
 inspect(root);
});

test('actual Chats loading markup exposes its progressbar name in React Native Web', () => {
 const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/chat/screens/ChatsScreen.tsx'), 'utf8'), {
  fileName: 'ChatsScreen.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
 }).outputText;
 const empty = () => null;
 const mocks = {
  '@react-navigation/native': { useNavigation: () => ({ canGoBack: () => false }) },
  '../../../firebase/client': { auth: { currentUser: { uid: 'fictional-accessibility-fixture' } } },
  '../../../theme/colors': { colors: {} },
  '../../../components/ScreenHeader': empty, '../../../components/Button': empty,
  '../../../components/Avatar': empty, '../../../components/HeroIllustration': empty, '../../../components/BottomNav': empty,
  '../api/chats': { useActiveChats: () => ({ chats: [], loading: true, error: false }), useNotes: () => ({}), useLastMessage: () => null },
  '../identity': { otherPerson: () => ({}) },
 };
 const m = { exports: {} };
 vm.runInNewContext(code, { module: m, exports: m.exports, require: name => {
  if (name in mocks) return mocks[name];
  if (name === 'react-native') return require('react-native-web');
  if (name === 'react/jsx-runtime') return require(name);
  throw Error('Unexpected rendering dependency ' + name);
 }});
 const markup = renderToStaticMarkup(React.createElement(m.exports.default));
 assert.match(markup, /<div(?=[^>]*role="progressbar")(?=[^>]*aria-label="Loading chats")[^>]*>/);
});

function locationHarness({ permission = { status: 'granted', canAskAgain: true }, requested = { status: 'granted', canAskAgain: true }, check, request, locate } = {}) {
 const counts = { checks: 0, requests: 0, positions: 0 };
 const api = load('services/location.ts', { 'expo-location': {
  getForegroundPermissionsAsync: async () => { counts.checks++; return check ? check() : permission; },
  requestForegroundPermissionsAsync: async () => { counts.requests++; return request ? request() : requested; },
  getCurrentPositionAsync: async () => { counts.positions++; return locate ? locate() : { coords: { latitude: 28.6, longitude: 77.2 } }; },
  Accuracy: { Balanced: 3 },
 }, './withDeadline': { withDeadline: work => withDeadline(work, 20) } });
 return { ...api, counts };
}
test('already granted location never relaunches runtime permission activities', async () => {
 const h = locationHarness();await h.getCurrentLocation();await h.getCurrentLocation();
 assert.deepEqual(h.counts, { checks: 2, requests: 0, positions: 2 }); // Fresh position and permission state each time.
});
test('revoked location is rechecked instead of using cached granted state', async () => {
 let calls = 0;const h = locationHarness({ check: () => ++calls === 1 ? { status: 'granted' } : { status: 'denied', canAskAgain: false } });
 await h.getCurrentLocation();await assert.rejects(h.getCurrentLocation(), /Location access/);
 assert.equal(h.counts.positions, 1);assert.equal(h.counts.requests, 0);
});
test('a denied but askable location permission is requested once before positioning', async () => {
 const h = locationHarness({ permission: { status: 'denied', canAskAgain: true } });
 await h.getCurrentLocation();assert.deepEqual(h.counts, { checks: 1, requests: 1, positions: 1 });
});
test('permanently denied location never launches another permission request', async () => {
 const h = locationHarness({ permission: { status: 'denied', canAskAgain: false } });
 await assert.rejects(h.getCurrentLocation(), /Location access/);assert.equal(h.counts.requests, 0);assert.equal(h.counts.positions, 0);
});
test('concurrent location intents share one pending permission prompt', async () => {
 let resolve;const pending = new Promise(r => resolve = r);const h = locationHarness({ permission: { status: 'denied', canAskAgain: true }, request: () => pending });
 const a = h.getCurrentLocation(), b = h.getCurrentLocation();await new Promise(r => setImmediate(r));
 resolve({ status: 'granted' });await Promise.all([a,b]);assert.equal(h.counts.requests, 1);assert.equal(h.counts.positions, 2);
});
test('late permission approval after a deadline cannot start GPS work', async () => {
 let resolve;const pending = new Promise(r => resolve = r);const h = locationHarness({ permission: { status: 'denied', canAskAgain: true }, request: () => pending });
 await assert.rejects(h.getCurrentLocation(), e => e.code === 'functions/deadline-exceeded');
 resolve({ status: 'granted' });await new Promise(r => setImmediate(r));assert.equal(h.counts.positions, 0);
});


test("next store candidate has a new monotonic version and hardened attestation profile", () => {
 const c=buildConfig({EAS_BUILD_PROFILE:"play-attestation",EXPO_PUBLIC_APP_CHECK:"on",EXPO_PUBLIC_OTP_PROVIDER:"2factor"}).default;
 // Published internal baseline is 0.3.3 / 9. Future candidates must be
 // newer, not permanently equal to a single version frozen into a test.
 assert.match(c.version,/^\d+\.\d+\.\d+$/);
 const version=c.version.split('.').map(Number), published=[0,3,3];
 const firstChanged=version.findIndex((n,i)=>n!==published[i]);
 assert.ok(firstChanged>=0 && version[firstChanged]>published[firstChanged], 'Candidate semantic version must exceed published 0.3.3');
 assert.ok(Number.isSafeInteger(c.android.versionCode) && c.android.versionCode>9, 'Candidate code must exceed published internal version 9');
 assert.equal(c.android.allowBackup,false);
});

test('onboarding distinguishes chat availability from eventual deletion and safety retention',()=>{
 const copy=fs.readFileSync(path.join(__dirname,'../src/features/onboarding/screens/WelcomeScreen.tsx'),'utf8');
 assert.ok(/available in chats for up to 72 hours/.test(copy),'Disclose the maximum chat availability window');
 assert.ok(/Deletion runs afterward/.test(copy),'Distinguish physical deletion from chat expiry');
 assert.ok(/Reported content may be retained longer for safety/.test(copy),'Disclose the safety retention exception');
 assert.ok(!/Messages are deleted 72 hours|Nothing stays forever/.test(copy),'Do not promise an unsupported exact deletion time');
});
test('empty-chat disclosure describes availability rather than promising exact deletion',()=>{
 const copy=fs.readFileSync(path.join(__dirname,'../src/features/chat/screens/ChatScreen.tsx'),'utf8');
 assert.ok(/Messages are available here for up to 72 hours/.test(copy),'Describe chat availability accurately');
 assert.ok(!/Messages are deleted 72 hours/.test(copy),'Do not promise exact physical deletion');
});
