const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness, deferred, tick } = require("./helpers/screen-actions.cjs");
const screen = "features/auth/screens/PhoneAuthScreen.tsx";
function setup() {
  const sent = deferred(),
    calls = [];
  const h = harness(screen, {
    "../api/phoneAuth": {
      usesTwoFactorSms: true,
      beginPhoneSignIn: (number) => {
        calls.push(number);
        return sent.promise;
      },
    },
  });
  return { h, sent, calls };
}
test("OTP recipient stays bound to the number used for the SMS request", async () => {
  const { h, sent, calls } = setup();
  h.find("phone-input").props.onChangeText("98765 43210");
  const send = h.find("send-code").props.onPress();
  h.find("phone-input").props.onChangeText("87654 32109");
  sent.resolve({ confirm: async () => {} });
  await send;
  await tick();
  assert.deepEqual(calls, ["+919876543210"]);
  assert.match(h.texts(), /We sent a 6 digit code to \+919876543210/);
  assert.doesNotMatch(h.texts(), /87654 32109/);
});
test("phone input is not editable while an SMS request is pending", async () => {
  const { h, sent } = setup();
  h.find("phone-input").props.onChangeText("9876543210");
  const send = h.find("send-code").props.onPress();
  assert.equal(h.find("phone-input").props.editable, false);
  sent.resolve({ confirm: async () => {} });
  await send;
});
test("same-render duplicate sends are suppressed", async () => {
  const { h, sent, calls } = setup();
  h.find("phone-input").props.onChangeText("9876543210");
  const press = h.find("send-code").props.onPress;
  const first = press();
  await press();
  assert.equal(calls.length, 1);
  sent.resolve({ confirm: async () => {} });
  await first;
});
test("failed resend preserves the original recipient and confirmation", async () => {
  const calls = [];
  let attempt = 0,
    verified = 0;
  const h = harness(screen, {
    "../api/phoneAuth": {
      usesTwoFactorSms: true,
      beginPhoneSignIn: async (number) => {
        calls.push(number);
        if (attempt++) throw Error("synthetic transport failure");
        return {
          confirm: async () => {
            verified++;
          },
        };
      },
    },
  });
  h.find("phone-input").props.onChangeText("09876543210");
  await h.find("send-code").props.onPress();
  await h.label("Send another code").props.onPress();
  assert.deepEqual(calls, ["+919876543210", "+919876543210"]);
  assert.match(h.texts(), /We sent a 6 digit code to \+919876543210/);
  h.find("verify-input").props.onChangeText("123456");
  await h.find("verify").props.onPress();
  assert.equal(verified, 1);
});
test("choosing another number binds the next challenge to its own recipient", async () => {
  const calls = [];
  const h = harness(screen, {
    "../api/phoneAuth": {
      usesTwoFactorSms: true,
      beginPhoneSignIn: async (number) => {
        calls.push(number);
        return { confirm: async () => {} };
      },
    },
  });
  h.find("phone-input").props.onChangeText("9876543210");
  await h.find("send-code").props.onPress();
  h.label("Use another number").props.onPress();
  h.find("phone-input").props.onChangeText("8765432109");
  await h.find("send-code").props.onPress();
  assert.deepEqual(calls, ["+919876543210", "+918765432109"]);
  assert.match(h.texts(), /We sent a 6 digit code to \+918765432109/);
});
test("failed initial send restores editing and allows a corrected number", async () => {
  let attempt = 0;
  const calls = [];
  const h = harness(screen, {
    "../api/phoneAuth": {
      usesTwoFactorSms: true,
      beginPhoneSignIn: async (number) => {
        calls.push(number);
        if (!attempt++) throw Error("synthetic transport failure");
        return { confirm: async () => {} };
      },
    },
  });
  h.find("phone-input").props.onChangeText("9876543210");
  await h.find("send-code").props.onPress();
  assert.equal(h.find("phone-input").props.editable, true);
  h.find("phone-input").props.onChangeText("8765432109");
  await h.find("send-code").props.onPress();
  assert.deepEqual(calls, ["+919876543210", "+918765432109"]);
  assert.match(h.texts(), /We sent a 6 digit code to \+918765432109/);
});
