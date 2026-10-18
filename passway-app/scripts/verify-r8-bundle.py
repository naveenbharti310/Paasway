"""Verify actual compiler output, not merely a Gradle flag or file name."""
import hashlib,json,pathlib,re,sys,zipfile

def verify(bundle,output):
    bundle=pathlib.Path(bundle);output=pathlib.Path(output)
    with zipfile.ZipFile(bundle) as z:
        name='BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'
        mapping=z.read(name)
        text=mapping.decode('utf-8')
        if not re.search(r'^# compiler: R8\s*$',text,re.M):raise ValueError('Bundle mapping was not produced by R8')
        classes=re.findall(r'^([^\s#]+) -> ([^\s:]+):$',text,re.M)
        renamed=sum(a!=b for a,b in classes)
        if not renamed:raise ValueError('Actual R8 class renaming evidence is required')
        if not any(n.startswith('base/dex/') and n.endswith('.dex') for n in z.namelist()):raise ValueError('Bundle has no base DEX')
        symbols=[n for n in z.namelist() if n.startswith('BUNDLE-METADATA/com.android.tools.build.debugsymbols/')]
    output.mkdir(parents=True,exist_ok=True)
    (output/'mapping.txt').write_bytes(mapping)
    report={'bundleSha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'r8CompilerVerified':True,'mappingEmbeddedInBundle':True,'mappingSha256':hashlib.sha256(mapping).hexdigest(),'mappedClasses':len(classes),'renamedClasses':renamed,'mappingClassRenamePercent':round(100*renamed/len(classes),2),'embeddedNativeSymbolFiles':len(symbols),'scope':'Compiler mapping evidence, not the Google Play DEX optimization percentage or runtime certification.'}
    (output/'r8-optimization.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
if __name__=='__main__':
    print(json.dumps(verify(sys.argv[1],sys.argv[2])))
