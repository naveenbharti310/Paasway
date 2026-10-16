'use strict';
const {validateTarget}=require('./check-deployed-app-check.cjs');
function validatePreviewEnv(env){
  if(['production','play-attestation'].includes(env.EAS_BUILD_PROFILE))throw new Error('The diagnostic web preview helper cannot build a release profile.');
  for(const name of ['EXPO_PUBLIC_API_URL','EXPO_PUBLIC_FIREBASE_WEB_API_KEY','EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN','EXPO_PUBLIC_FIREBASE_PROJECT_ID','EXPO_PUBLIC_FIREBASE_WEB_APP_ID','EXPO_PUBLIC_FIREBASE_SENDER_ID']){
    if(typeof env[name]!=='string'||!env[name].trim())throw new Error(`Set ${name} explicitly for the controlled preview.`);
  }
  const target=new URL(env.EXPO_PUBLIC_API_URL);
  if(target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('Preview API must be an origin without credentials, path or query.');
  let targetKind;
  if(['http:','https:'].includes(target.protocol)&&['localhost','127.0.0.1','[::1]'].includes(target.hostname))targetKind='loopback';
  else{
    const origin=validateTarget(env.EXPO_PUBLIC_API_URL);
    if(origin==='https://passway-api.vercel.app')throw new Error('A diagnostic web preview must not target the production API.');
    targetKind='owner-preview';
  }
  // The current browser shim does not implement App Check. Keep it confined
  // to explicit diagnostic environments; it is never production attestation.
  if(env.EXPO_PUBLIC_APP_CHECK!=='off')throw new Error('This diagnostic web shim requires explicit EXPO_PUBLIC_APP_CHECK=off and a non-production API.');
  if(env.EXPO_PUBLIC_OTP_PROVIDER!=='2factor')throw new Error('Set EXPO_PUBLIC_OTP_PROVIDER=2factor explicitly; do not fall back to Firebase SMS.');
  return{targetKind};
}
module.exports={validatePreviewEnv};
if(require.main===module){
  try{validatePreviewEnv(process.env);console.log('Controlled preview configuration accepted; build only.');}
  catch{console.error('Preview configuration rejected. Set explicit public Firebase settings, a controlled preview or loopback API, diagnostic App Check off and the 2factor adapter. No files published.');process.exitCode=1;}
}
