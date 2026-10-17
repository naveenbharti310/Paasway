'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const docs=path.join(__dirname,'../../docs');
for(const name of ['index.html','privacy.html','delete-account.html','use-rules.html'])test(`${name} is accessible static support content without trackers or forms`,()=>{
 const s=fs.readFileSync(path.join(docs,name),'utf8');
 assert.match(s,/<!doctype html>/i);assert.match(s,/<html lang="en">/);assert.match(s,/name="viewport"/);
 assert.match(s,/<h1>/);assert.match(s,/LIMERENCE TECHNOLOGIES PRIVATE LIMITED/);assert.match(s,/Limerencetechnologies@gmail\.com/);
 assert.match(s,/Content-Security-Policy/);assert.match(s,/name="referrer" content="no-referrer"/);
 assert.doesNotMatch(s,/<script|<iframe|<form|<img|<video|<object|<embed/i);
 for(const [,href]of s.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(/^(https:|mailto:)/.test(href))continue;
  assert.ok(!href.includes('..')&&!href.startsWith('/'));
  assert.ok(fs.existsSync(path.join(docs,href)),`missing local destination ${href}`);
 }
 assert.doesNotMatch(s,/9599549054|999990000[12]|api[_ -]?key|PRIVATE KEY/i);
});
test('privacy accurately distinguishes visibility, cleanup and safety retention',()=>{
 const s=fs.readFileSync(path.join(docs,'privacy.html'),'utf8');
 for(const phrase of ['72 hours','asynchronous','90 day','180 days','seven days','no automatic expiry','does not offer end to end encryption','2Factor','Natural Language','location data','pseudonymous','at least 18'])assert.ok(s.includes(phrase),phrase);
 assert.doesNotMatch(s,/all data is deleted immediately|zero data collection|guaranteed secure|certified|GDPR compliant/i);
});
test('deletion works as public instructions without app download or login',()=>{
 const s=fs.readFileSync(path.join(docs,'delete-account.html'),'utf8');
 for(const phrase of ['Request deletion without the app','mailto:Limerencetechnologies@gmail.com','What may remain','Delete account','does not delete the account','verify'])assert.ok(s.includes(phrase),phrase);
 assert.match(s,/Do not include a password, SMS code/);
});
