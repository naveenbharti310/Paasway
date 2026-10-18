const fs=require('node:fs');const path=require('node:path');
function checkGenerated(root){
 const props=fs.readFileSync(path.join(root,'gradle.properties'),'utf8');
 const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
 const rules=fs.readFileSync(path.join(root,'app/proguard-rules.pro'),'utf8');
 for(const name of ['enableMinifyInReleaseBuilds','enableShrinkResourcesInReleaseBuilds']){
  const values=props.split(/\r?\n/).filter(l=>l.startsWith('android.'+name+'=')).map(l=>l.slice(l.indexOf('=')+1).trim());
  if(values.length!==1||values[0]!=='true')throw Error('Generated Android release optimization is missing or ambiguous: '+name);
 }
 if(!gradle.includes('getDefaultProguardFile("proguard-android-optimize.txt")')||gradle.includes('getDefaultProguardFile("proguard-android.txt")'))throw Error('Optimizing R8 default rules required.');
 if(!gradle.includes('minifyEnabled enableMinifyInReleaseBuilds')||!gradle.includes('shrinkResources enableShrinkResources.toBoolean()'))throw Error('Generated release must consume both optimization flags.');
 if(!gradle.includes("debugSymbolLevel 'SYMBOL_TABLE'"))throw Error('Native symbol table retention required.');
 if(/^-dont(?:obfuscate|optimize|shrink)\b|^-dontwarn\s+\*\s*$|^-keep\s+class\s+\*\*(?:\s|\{)/m.test(rules))throw Error('App-owned global optimization escape hatch is not allowed.');
 return {minification:true,resourceShrinking:true,optimizedDefaultRules:true,nativeSymbolTableRequested:true};
}
module.exports={checkGenerated};
if(require.main===module){try{console.log(JSON.stringify(checkGenerated(process.argv[2]||'android')));}catch(e){console.error(e.message);process.exitCode=1;}}
