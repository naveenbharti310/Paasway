import importlib.util,pathlib,tempfile,unittest,zipfile,json
spec=importlib.util.spec_from_file_location('verify_r8_bundle',pathlib.Path(__file__).resolve().parents[1]/'scripts/verify-r8-bundle.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class R8Bundle(unittest.TestCase):
 def run_bundle(self,mapping=None,dex=True):
  root=tempfile.TemporaryDirectory();self.addCleanup(root.cleanup);p=pathlib.Path(root.name);bundle=p/'release.aab'
  with zipfile.ZipFile(bundle,'w') as z:
   if mapping is not None:z.writestr('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map',mapping)
   if dex:z.writestr('base/dex/classes.dex',b'dex fixture')
  return m.verify(bundle,p/'out'),p
 def test_real_mapping_is_required(self):
  with self.assertRaises(KeyError):self.run_bundle()
 def test_wrong_compiler_is_rejected(self):
  with self.assertRaises(ValueError):self.run_bundle('# compiler: D8\ncom.example.App -> a:\n')
 def test_no_class_renaming_is_rejected(self):
  with self.assertRaises(ValueError):self.run_bundle('# compiler: R8\ncom.example.App -> com.example.App:\n')
 def test_no_dex_is_rejected(self):
  with self.assertRaises(ValueError):self.run_bundle('# compiler: R8\ncom.example.App -> a:\n',dex=False)
 def test_mapping_is_preserved_and_metric_is_scoped(self):
  mapping='# compiler: R8\ncom.example.App -> a:\ncom.example.Entry -> com.example.Entry:\n'
  r,p=self.run_bundle(mapping);self.assertEqual((p/'out/mapping.txt').read_text(),mapping);self.assertEqual(r['mappingClassRenamePercent'],50);self.assertEqual(r['renamedClasses'],1);self.assertIn('not the Google Play',r['scope']);self.assertEqual(json.loads((p/'out/r8-optimization.json').read_text())['bundleSha256'],r['bundleSha256'])
if __name__=='__main__':unittest.main()
