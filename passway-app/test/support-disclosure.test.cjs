const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { harness, deferred } = require('./helpers/screen-actions.cjs');

function support(deadline = (work) => work()) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/support.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: m, exports: m.exports,
    require: (name) => {
      assert.equal(name, './withDeadline');
      return { withDeadline: deadline };
    },
  });
  return m.exports;
}

test('phone disclosure includes authentication and abuse prevention without peer disclosure', () => {
  const s = support();
  assert.match(s.PHONE_USE_DISCLOSURE, /sign in, help prevent abuse/);
  assert.match(s.PHONE_USE_DISCLOSURE, /not shown to people you connect with/);
  assert.doesNotMatch(s.PHONE_USE_DISCLOSURE, /only to sign in|never shown to anyone/i);
});
test('phone-derived eligibility enforcement is disclosed before a number is supplied', () => {
  assert.match(support().PHONE_USE_DISCLOSURE, /enforce age eligibility/);
});
test('both phone and settings screens use the same truthful phone disclosure', () => {
  for (const file of ['auth/screens/PhoneAuthScreen.tsx', 'settings/screens/SettingsScreen.tsx']) {
    const text = fs.readFileSync('src/features/' + file, 'utf8');
    assert.match(text, /\{PHONE_USE_DISCLOSURE\}/);
    assert.doesNotMatch(text, /used only to sign in|Used only to sign in|never shown to anyone\./);
  }
});
test('support address is the approved public contact', () => {
  assert.equal(support().SUPPORT_EMAIL, 'Limerencetechnologies@gmail.com');
});
test('email action contains no phone, UID, logs, or message body', () => {
  const s = support(), uri = new URL(s.SUPPORT_URI);
  assert.equal(uri.protocol, 'mailto:');
  assert.equal(uri.pathname, s.SUPPORT_EMAIL);
  assert.deepEqual([...uri.searchParams.keys()], ['subject']);
  assert.equal(uri.searchParams.get('subject'), 'Passway support');
});
test('opening support invokes the email application once', async () => {
  const s = support(), urls = [];
  const result = await s.openSupportEmail(async (url) => { urls.push(url); });
  assert.equal(result.opened, true);
  assert.deepEqual(urls, [s.SUPPORT_URI]);
});
test('missing email application returns useful contact without leaking exception details', async () => {
  const s = support();
  const result = await s.openSupportEmail(async () => { throw Error('Sensitive native exception'); });
  assert.equal(result.opened, false);
  assert.match(result.message, /Limerencetechnologies@gmail.com/);
  assert.doesNotMatch(result.message, /Sensitive native exception/);
});
test('native email invocation has a bounded deadline', async () => {
  let calls = 0;
  const s = support(async (_work, timeout) => {
    calls++;
    assert.equal(timeout, 10000);
    throw Error('deadline');
  });
  const result = await s.openSupportEmail(async () => {});
  assert.equal(calls, 1);
  assert.equal(result.opened, false);
});
test('same-render rapid support taps open only one email intent', async () => {
  const gate = deferred(); let calls = 0;
  const h = harness('features/settings/screens/SettingsScreen.tsx', {
    '../../../services/support': {
      SUPPORT_EMAIL: 'Limerencetechnologies@gmail.com',
      openSupportEmail: async () => { calls++; return gate.promise; },
    },
  });
  const press = h.find('email-support').props.onPress;
  const work = [press(), press(), press()];
  assert.equal(calls, 1);
  gate.resolve({ opened: true });
  await Promise.all(work);
  assert.equal(h.find('email-support').props.loading, false);
});
test('failed email intent shows the address and releases for explicit retry', async () => {
  let calls = 0;
  const h = harness('features/settings/screens/SettingsScreen.tsx', {
    '../../../services/support': {
      SUPPORT_EMAIL: 'Limerencetechnologies@gmail.com',
      openSupportEmail: async () => { calls++; return { opened: false, message: 'Email support at Limerencetechnologies@gmail.com.' }; },
    },
  });
  await h.find('email-support').props.onPress();
  assert.match(h.texts(), /Email support at Limerencetechnologies@gmail.com/);
  await h.find('email-support').props.onPress();
  assert.equal(calls, 2);
});
test('actual settings handler reaches native Linking through the real support helper', async () => {
  const real = support(), urls = [];
  const h = harness('features/settings/screens/SettingsScreen.tsx', {
    '../../../services/support': real,
    'react-native': { Linking: { openURL: async (uri) => { urls.push(uri); } } },
  });
  await h.find('email-support').props.onPress();
  assert.deepEqual(urls, [real.SUPPORT_URI]);
  assert.equal(h.find('email-support').props.loading, false);
});
test('native Linking rejection is caught through the real screen and helper', async () => {
  const real = support();
  const h = harness('features/settings/screens/SettingsScreen.tsx', {
    '../../../services/support': real,
    'react-native': { Linking: { openURL: async () => { throw Error('Native private error'); } } },
  });
  await h.find('email-support').props.onPress();
  assert.match(h.texts(), /Email support at Limerencetechnologies@gmail.com/);
  assert.doesNotMatch(h.texts(), /Native private error/);
  assert.equal(h.find('email-support').props.loading, false);
});
test('settings safety guidance describes account blocking without a permanent person-level promise', () => {
  const h = harness('features/settings/screens/SettingsScreen.tsx');
  assert.match(h.texts(), /Reporting closes the chat and blocks that account from reconnecting with you\./);
  assert.doesNotMatch(h.texts(), /They will not be able to connect with you again|never reconnect|permanently blocked/i);
});

test('explicit send action discloses Firebase phone abuse processing before requesting SMS',()=>{const disclosure=support().PHONE_AUTH_CONSENT;for(const text of ['By choosing Send code','2Factor','Firebase Authentication (Google)','store and use it','across Google services'])assert.ok(disclosure.includes(text));const screen=fs.readFileSync('src/features/auth/screens/PhoneAuthScreen.tsx','utf8');assert.ok(screen.indexOf('{PHONE_AUTH_CONSENT}')<screen.indexOf('<Button label="Send code"'));});
