const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject}; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(overrides={}) {
  let cursor=0, effectCursor=0, listener, authError, time=0, nextTimer=0, removed=0, unsubscribed=0;
  const state=[],effects=[],timers=new Map();
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}];},useEffect(fn,deps){const i=effectCursor++;const old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps,cleanup:fn()};}}};
  const runtime={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const mock={
    react,
    'react/jsx-runtime':runtime,
    'react-native':{View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',ActivityIndicator:'ActivityIndicator',Platform:{OS:'android'}},
    'expo-notifications':{addPushTokenListener:()=>({remove(){removed++}})},
    '@react-navigation/native':{NavigationContainer:'NavigationContainer',DarkTheme:{colors:{}}},
    '@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'Navigator',Screen:'Screen'})},
    '@react-native-firebase/auth':{onAuthStateChanged:(auth,onUser,onError)=>{listener=onUser;authError=onError;return ()=>{unsubscribed++}},signOut:overrides.signOut||asyncNull},
    '../firebase/client':{auth:{}},
    '../features/connections/api/activeConnection':{findActiveConnection:overrides.findActiveConnection||asyncNull},
    '../features/auth/api/ensureUser':{ensureUserDoc:overrides.ensureUserDoc||asyncReady},
    '../services/onboarding':{hasSeenWelcome:overrides.hasSeenWelcome||asyncFalse,welcomeSeenNow:()=>false},
    '../services/notifications':{registerForPush:async()=>{},refreshPushToken:async()=>{}},
    '../services/errors':{errorMessage:(err,fallback)=>err?.message||fallback},
    '../theme/colors':{colors:{bg:'black',gold:'gold',accentFill:'gold',textPrimary:'white'}},
    '../hooks/useReducedMotion':{__esModule:true,default:()=>false},
    '../services/diagnostics':{diagnosticScreen:()=>{}},
  };
  async function asyncNull(){return null} async function asyncReady(){return 'ready'} async function asyncFalse(){return false}
  const source=fs.readFileSync(path.join(__dirname,'../src/navigation/RootNavigator.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(code,{module:m,exports:m.exports,require:name=>mock[name]||{__esModule:true,default:name},console,setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,at:time+delay});return id},clearTimeout:id=>timers.delete(id)});
  function render(){cursor=effectCursor=0;return m.exports.default()}
  function flatten(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(flatten)]}
  function find(id){const tree=render(),all=flatten(tree);const tagged=all.find(n=>n.props?.testID===id);if(tagged)return tagged;
    if(id==='startup-loading')return all.find(n=>n.type==='ActivityIndicator');
    const retry=all.find(n=>n.type==='TouchableOpacity'&&flatten(n).some(c=>c.type==='Text'&&c.props?.children==='Try again'));
    if(id==='startup-retry')return retry;if(id==='startup-error'&&retry)return tree;
  }
  function advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn()}}
  render();
  return {notify:user=>listener(user),error:err=>authError(err),advance,render,find,unmount:()=>effects.forEach(e=>e.cleanup?.()),timers,stats:()=>({removed,unsubscribed})};
}

test('startup exits loading with retry when native auth callback never arrives',()=>{const h=harness();h.advance(20001);assert.ok(h.find('startup-error'));assert.ok(h.find('startup-retry'));assert.equal(h.find('startup-loading'),undefined)});
test('stalled account transaction has bounded visible loading',async()=>{const d=deferred();const h=harness({ensureUserDoc:()=>d.promise});void h.notify({uid:'a'});h.advance(20001);assert.ok(h.find('startup-error'));d.resolve('ready');await tick();assert.ok(h.find('startup-error'),'late completion must not erase recovery UI')});
test('stalled active-chat lookup cannot hold startup indefinitely',async()=>{const d=deferred();const h=harness({findActiveConnection:()=>d.promise});void h.notify({uid:'a'});await tick();h.advance(20001);assert.ok(h.find('startup-error'));d.resolve(null);await tick();assert.ok(h.find('startup-error'))});
test('stalled signed-out welcome storage offers recovery',async()=>{const d=deferred();const h=harness({hasSeenWelcome:()=>d.promise});void h.notify(null);h.advance(20001);assert.ok(h.find('startup-error'))});
test('successful startup clears its watchdog',async()=>{const h=harness();await h.notify({uid:'a'});assert.equal(h.timers.size,0);h.advance(60000);assert.equal(h.find('startup-error'),undefined);assert.equal(h.render().type,'NavigationContainer')});
test('retry creates a fresh guarded attempt',async()=>{let calls=0;const h=harness({ensureUserDoc:()=>++calls===1?new Promise(()=>{}):Promise.resolve('ready')});void h.notify({uid:'a'});h.advance(20001);h.find('startup-retry').props.onPress();h.render();await h.notify({uid:'a'});assert.equal(h.find('startup-error'),undefined);assert.equal(h.render().type,'NavigationContainer');assert.equal(h.timers.size,0)});
test('auth error invalidates an in-flight successful setup',async()=>{const d=deferred();const h=harness({ensureUserDoc:()=>d.promise});void h.notify({uid:'a'});h.error(new Error('auth transport failed'));d.resolve('ready');await tick();assert.ok(h.find('startup-error'));assert.equal(h.render().type,'View')});
test('unmount cancels deadline and ignores late completion',async()=>{const d=deferred();const h=harness({ensureUserDoc:()=>d.promise});void h.notify({uid:'a'});h.unmount();assert.equal(h.timers.size,0);d.resolve('ready');await tick();assert.equal(h.stats().unsubscribed,1)});
test('an older auth user cannot overwrite the newer session',async()=>{const d=deferred();const h=harness({ensureUserDoc:uid=>uid==='old'?d.promise:Promise.resolve('ready')});void h.notify({uid:'old'});await h.notify({uid:'new'});d.resolve('under_minimum');await tick();assert.equal(h.render().type,'NavigationContainer');assert.equal(h.timers.size,0)});

test('late first auth callback does not extend the original startup budget',async()=>{const h=harness({ensureUserDoc:()=>new Promise(()=>{})});h.advance(15000);void h.notify({uid:'a'});h.advance(5001);assert.ok(h.find('startup-error'))});
test('late auth callback after deadline cannot dismiss recovery without retry',async()=>{const h=harness();h.advance(20001);await h.notify({uid:'a'});assert.ok(h.find('startup-error'));assert.equal(h.timers.size,0)});
test('an ordinary account error clears the watchdog',async()=>{const h=harness({ensureUserDoc:async()=>{throw new Error('account unavailable')}});await h.notify({uid:'a'});assert.ok(h.find('startup-error'));assert.equal(h.timers.size,0)});
test('native auth error clears the watchdog',()=>{const h=harness();h.error(new Error('native auth failed'));assert.ok(h.find('startup-error'));assert.equal(h.timers.size,0)});
test('a later auth event after a completed session gets a new deadline',async()=>{const h=harness({ensureUserDoc:uid=>uid==='a'?Promise.resolve('ready'):new Promise(()=>{})});await h.notify({uid:'a'});h.advance(30000);void h.notify({uid:'b'});h.advance(20001);assert.ok(h.find('startup-error'))});

test('Sign out after a deadline starts a fresh signed-out subscription',async()=>{const h=harness();h.advance(20001);h.find('startup-signout').props.onPress();await tick();h.render();await h.notify(null);assert.equal(h.find('startup-error'),undefined);assert.equal(h.render().type,'NavigationContainer');assert.equal(h.stats().unsubscribed,1)});
test('failed recovery Sign out remains retryable without an unhandled rejection',async()=>{const h=harness({signOut:async()=>{throw new Error('offline signout')}});h.advance(20001);h.find('startup-signout').props.onPress();await tick();assert.ok(h.find('startup-error'));assert.ok(h.find('startup-retry'));assert.equal(h.timers.size,0)});
