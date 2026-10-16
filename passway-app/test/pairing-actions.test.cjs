const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function harness({ failFirstLocation = false } = {}) {
 const state = []; let cursor = 0, generated = 0, locations = 0; const navigations = [];
 const react = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => state[i] = value]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useEffect() {} };
 const mocks = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: x => x } }, '@react-navigation/native': { useNavigation: () => ({ navigate: (...args) => navigations.push(args) }) }, '../../../firebase/client': { auth: { currentUser: { uid: 'alice' } } }, '../api/connections': { generateTid: async () => { generated++; return { tid: 'AB12', createdAt: 1, expiresAt: 300001 }; } }, '../../../services/location': { getCurrentLocation: async () => { locations++; if (failFirstLocation && locations === 1) throw Error('Synthetic location failure'); return { lat: 28.6, lng: 77.2 }; } }, '../../profile/api/profile': { saveDefaultName: async () => {} }, '../../../theme/colors': { colors: {} }, '../../../services/errors': { errorMessage: (_error, fallback) => fallback } };
 const m = { exports: {} }; const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/connections/screens/GenerateScreen.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 vm.runInNewContext(code, { module: m, exports: m.exports, require: name => mocks[name] || { __esModule: true, default: name }, console });
 function flat(n) { return !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(flat)]; }
 function find(id) { cursor = 0; return flat(m.exports.default()).find(n => n.props?.testID === id); }
 find('name-input').props.onChangeText('Synthetic Tester');
 return { find, count: () => ({ generated, locations, navigations: navigations.length }) };
}
test('same-render rapid Generate invocations start only one location/API intent and navigation', async () => {
 const h = harness(); const press = h.find('generate').props.onPress;
 await Promise.all([press(), press(), press()]);
 assert.deepEqual(h.count(), { generated: 1, locations: 1, navigations: 1 });
});
test('a failed generation releases the immediate lock for an explicit retry', async () => {
 const h = harness({ failFirstLocation: true }); await h.find('generate').props.onPress();
 assert.deepEqual(h.count(), { generated: 0, locations: 1, navigations: 0 });
 await h.find('generate').props.onPress();
 assert.deepEqual(h.count(), { generated: 1, locations: 2, navigations: 1 });
});
