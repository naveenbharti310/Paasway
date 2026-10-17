const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {harness,deferred}=require('./helpers/screen-actions.cjs');
function documents(deadline=work=>work()){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/publicDocuments.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>{assert.equal(n,'./withDeadline');return{withDeadline:deadline}}});return m.exports;
}
test('privacy and deletion pages are fixed HTTPS URLs without identity or query parameters',()=>{
 const d=documents();for(const [key,value]of Object.entries(d.PUBLIC_DOCUMENTS)){const u=new URL(value);assert.equal(u.origin,'https://naveenbharti310.github.io');assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.pathname,`/Paasway/${key==='privacy'?'privacy':'delete-account'}.html`);}assert.equal(Object.isFrozen(d.PUBLIC_DOCUMENTS),true);
});
for(const key of ['privacy','deletion'])test(`actual ${key} action opens only its allowlisted URL`,async()=>{
 const d=documents(),urls=[];const x=await d.openPublicDocument(key,async u=>urls.push(u));assert.equal(x.opened,true);assert.deepEqual(urls,[d.PUBLIC_DOCUMENTS[key]]);
});
test('untrusted document keys cannot become URL or prototype lookups',async()=>{
 const d=documents();let count=0;for(const key of ['https://evil.invalid','__proto__','constructor','toString',null,undefined]){const x=await d.openPublicDocument(key,async()=>count++);assert.equal(x.opened,false);}assert.equal(count,0);
});
test('browser failures show a copyable public URL without exposing exceptions',async()=>{
 const d=documents();const x=await d.openPublicDocument('privacy',async()=>{throw Error('private native detail')});assert.equal(x.opened,false);assert.ok(x.message.includes(d.PUBLIC_DOCUMENTS.privacy));assert.doesNotMatch(x.message,/private native detail/);
});
test('opening a document is deadline bounded rather than a permanent spinner',async()=>{
 let count=0;const d=documents(async(_work,ms)=>{count++;assert.equal(ms,10000);throw Error('timeout')});assert.equal((await d.openPublicDocument('deletion',async()=>{})).opened,false);assert.equal(count,1);
});
test('same-render rapid privacy and deletion taps dispatch one browser handoff',async()=>{
 let count=0;const gate=deferred();const h=harness('components/PrivacyLinks.tsx',{'../services/publicDocuments':{openPublicDocument:async()=>{count++;return gate.promise}},'../theme/colors':{colors:{}}});const a=h.find('privacy-notice').props.onPress,b=h.find('deletion-information').props.onPress;const work=[a(),b(),a()];assert.equal(count,1);assert.equal(h.find('deletion-information').props.disabled,true);gate.resolve({opened:true});await Promise.all(work);assert.equal(h.find('privacy-notice').props.loading,false);assert.equal(h.find('deletion-information').props.disabled,false);
});
test('native rejection releases privacy controls for a deliberate retry',async()=>{
 const d=documents();let count=0;const h=harness('components/PrivacyLinks.tsx',{'../services/publicDocuments':d,'../theme/colors':{colors:{}},'react-native':{Linking:{openURL:async()=>{count++;throw Error('private')}}}});await h.find('privacy-notice').props.onPress();assert.ok(h.texts().includes(d.PUBLIC_DOCUMENTS.privacy));assert.doesNotMatch(h.texts(),/private/);assert.equal(h.find('deletion-information').props.disabled,false);await h.find('deletion-information').props.onPress();assert.equal(count,2);assert.ok(h.texts().includes(d.PUBLIC_DOCUMENTS.deletion));
});
test('privacy information is present before authentication and in account settings',()=>{
 for(const file of ['src/features/auth/screens/PhoneAuthScreen.tsx','src/features/settings/screens/SettingsScreen.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<PrivacyLinks\s*\/>/);
});
