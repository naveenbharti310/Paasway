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
 const {getCurrentLocation}=load('services/location.ts',{'expo-location':{requestForegroundPermissionsAsync:async()=>({status:'granted'}),Accuracy:{Balanced:3},getCurrentPositionAsync:()=>new Promise(()=>{})},'./withDeadline':{withDeadline:(work,ms)=>{requestedMs=ms;return withDeadline(work,10)}}});
 await assert.rejects(getCurrentLocation(),e=>e.code==='functions/deadline-exceeded');assert.equal(requestedMs,15000);
});
test('denied location permission never requests a position',async()=>{
 let calls=0;const {getCurrentLocation}=load('services/location.ts',{'expo-location':{requestForegroundPermissionsAsync:async()=>({status:'denied'}),Accuracy:{Balanced:3},getCurrentPositionAsync:async()=>{calls++}},'./withDeadline':{withDeadline}});
 await assert.rejects(getCurrentLocation(),/Location access/);assert.equal(calls,0);
});


function buildConfig(env){return load('../app.config.ts',{fs:{existsSync:()=>true},child_process:{execSync(){throw Error('unexpected build execution')}}},{process:{env}});}
test('production build refuses an inherited App Check bypass',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_APP_CHECK:'off'}),/must not disable App Check/);});
test('production defaults keep App Check on',()=>{assert.equal(buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_OTP_PROVIDER:'2factor'}).default.name,'Passway');});
test('diagnostic bypass stays restricted to the explicit internal profile',()=>{assert.throws(()=>buildConfig({EAS_BUILD_PROFILE:'production',EXPO_PUBLIC_DIAGNOSTICS:'1'}),/restricted/);assert.equal(buildConfig({EAS_BUILD_PROFILE:'play-diagnostics',EXPO_PUBLIC_DIAGNOSTICS:'1',EXPO_PUBLIC_APP_CHECK:'off'}).default.name,'Passway');});
test('a misspelled SMS provider cannot silently select another provider',()=>{assert.throws(()=>buildConfig({EXPO_PUBLIC_OTP_PROVIDER:'2factro'}),/must be firebase or 2factor/);});


test('the actual verification adapter bounds a stalled native Firebase exchange',async()=>{
 const h=phoneHarness({fetch:async url=>new Response(JSON.stringify({result:url.endsWith('otpSend')?{challengeId:'test-challenge'}:{token:'custom-token-test'}})),customSignIn:()=>new Promise(()=>{})});
 const c=await h.beginPhoneSignIn('+919876543210');await assert.rejects(c.confirm('123456'),e=>e.code==='functions/deadline-exceeded');assert.equal(h.stats().custom,1);assert.equal(h.stats().fallback,0);
});
