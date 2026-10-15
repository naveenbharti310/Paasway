const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {sendPushNotification}=require('../lib/push');
const originalFetch=global.fetch, originalTimeout=AbortSignal.timeout;
afterEach(()=>{global.fetch=originalFetch;AbortSignal.timeout=originalTimeout;});
test('push network work has a finite abort deadline and rejects redirects',async()=>{
 let options;
 global.fetch=async(_url,o)=>{options=o;return new Response('{"data":{"status":"ok"}}');};
 await sendPushNotification('ExpoPushToken[test-only]','Passway','New message');
 assert.ok(options.signal instanceof AbortSignal);assert.equal(options.redirect,'error');
});
test('a stalled push is aborted without failing the committed message operation',async()=>{
 let configuredTimeout;
 AbortSignal.timeout=(ms)=>{configuredTimeout=ms;return originalTimeout(5);};
 global.fetch=async(_url,o)=>new Promise((_resolve,reject)=>{
   if(!o.signal){reject(Error('missing deadline'));return;}
   o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true});
 });
 const keepAlive=setTimeout(()=>{},300);
 try {await sendPushNotification('ExpoPushToken[test-only]','Passway','New message');assert.equal(configuredTimeout,4000);}
 finally{clearTimeout(keepAlive);}
});
