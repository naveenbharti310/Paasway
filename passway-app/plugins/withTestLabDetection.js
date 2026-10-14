const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = function withTestLabDetection(config) {
  if (process.env.EXPO_PUBLIC_DIAGNOSTICS !== '1') return config;
  config = withMainApplication(config, mod => {
    const anchor = 'PackageList(this).packages.apply {';
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Could not register test-lab detection module');
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${anchor}\n              add(PasswayDiagnosticsPackage())`);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/passway/app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PasswayDiagnosticsPackage.kt'), `package com.passway.app
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager
class PasswayDiagnosticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "PasswayDiagnostics"
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf("isTestLab" to (Settings.System.getString(reactApplicationContext.contentResolver, "firebase.test.lab") == "true"))
}
class PasswayDiagnosticsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PasswayDiagnosticsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`);
    return mod;
  }]);
};
