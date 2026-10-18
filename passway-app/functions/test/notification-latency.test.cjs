process.env.MODERATION_PROVIDER = "rules";
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { MemoryFirestore } = require("./support.cjs");
const firebase = require("../lib/lib/firebase");
const push = require("../lib/push");
const { sendMessage } = require("../lib/handlers/messages");
const { redeemTid } = require("../lib/handlers/tids");
const { encodeGeohash } = require("../lib/geo");
const tick = () => new Promise((r) => setImmediate(r));
let db;
const originalNotify = push.notifyUser;
beforeEach(() => {
  db = new MemoryFirestore();
  firebase.db = db;
  for (const uid of ["alice", "bob"])
    db.seed("users/" + uid, {
      status: "active",
      ageConfirmedAt: 1,
      contentPolicyVersion: "2026-10-17.1",
      contentPolicyAcceptedAt: 1,
    });
  db.seed("connections/chat", {
    connectionId: "chat",
    userA: "alice",
    userB: "bob",
    status: "active",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });
  db.seed("tids/AB12", {
    tid: "AB12",
    generatorId: "alice",
    generatorName: "Alice",
    geoHash: encodeGeohash(28.6, 77.2),
    status: "active",
    createdAt: Date.now(),
    expiresAt: Date.now() + 300000,
  });
});
afterEach(() => {
  push.notifyUser = originalNotify;
});
for (const [name, handler, uid, data] of [
  [
    "message",
    sendMessage,
    "alice",
    {
      connectionId: "chat",
      content: "synthetic latency fixture",
      clientMessageId: "latency-test-key-0001",
    },
  ],
  [
    "pairing",
    redeemTid,
    "bob",
    {
      tid: "AB12",
      displayName: "Bob",
      lat: 28.6,
      lng: 77.2,
      redemptionId: "latency-redemption-key-0001",
    },
  ],
]) {
  test(
    name +
      " acknowledgement does not wait for stalled push when the platform retains it",
    async () => {
      let release,
        completed = false;
      const held = new Promise((r) => (release = r)),
        pending = [];
      push.notifyUser = () => held;
      const work = handler
        .handler(uid, data, {
          phoneNumber: "+919876543210",
          defer: (task) => pending.push(task),
        })
        .then((v) => {
          completed = true;
          return v;
        });
      try {
        await tick();
        await tick();
        assert.equal(completed, true);
        assert.equal(pending.length, 1);
        assert.ok(
          [...db.values.keys()].some((k) =>
            name === "message"
              ? k.startsWith("connections/chat/messages/")
              : k.startsWith("connectionRequests/"),
          ),
        );
      } finally {
        release();
        await work;
        await Promise.all(pending);
      }
    },
  );
  test(
    name +
      " fallback retains push work when no post-response platform is supplied",
    async () => {
      let release,
        completed = false;
      push.notifyUser = () => new Promise((r) => (release = r));
      const work = handler
        .handler(uid, data, { phoneNumber: "+919876543210" })
        .then(() => {
          completed = true;
        });
      try {
        await tick();
        await tick();
        assert.equal(completed, false);
      } finally {
        release();
        await work;
      }
      assert.equal(completed, true);
    },
  );
}

test("same-millisecond sends still change parent metadata for both messages", async () => {
  push.notifyUser = async () => {};
  const now = Date.now;
  Date.now = () => 1900000000000;
  try {
    await sendMessage.handler(
      "alice",
      {
        connectionId: "chat",
        content: "one",
        clientMessageId: "same-clock-message-0001",
      },
      { phoneNumber: "+919876543210" },
    );
    const first = db.read("connections/chat");
    await sendMessage.handler(
      "alice",
      {
        connectionId: "chat",
        content: "two",
        clientMessageId: "same-clock-message-0002",
      },
      { phoneNumber: "+919876543210" },
    );
    const second = db.read("connections/chat");
    assert.equal(first.lastActivityAt, second.lastActivityAt);
    assert.equal(typeof first.lastMessageId, "string");
    assert.notEqual(first.lastMessageId, second.lastMessageId);
    assert.ok(db.read("connections/chat/messages/" + second.lastMessageId));
  } finally {
    Date.now = now;
  }
});
test("an idempotent send replay does not create another message or notification invalidation", async () => {
  let notifications = 0;
  push.notifyUser = async () => {
    notifications++;
  };
  const data = {
    connectionId: "chat",
    content: "same intent",
    clientMessageId: "replay-no-extra-message-001",
  };
  await sendMessage.handler("alice", data, { phoneNumber: "+919876543210" });
  const first = db.read("connections/chat").lastMessageId;
  await sendMessage.handler("alice", data, { phoneNumber: "+919876543210" });
  assert.equal(db.read("connections/chat").lastMessageId, first);
  assert.equal(notifications, 1);
});
test("a throwing host deferral hook falls back to retaining notification work", async () => {
  let release,
    completed = false;
  const held = new Promise((r) => (release = r));
  const work = push
    .completeNotification(held, () => {
      throw Error("host context missing");
    })
    .then(() => {
      completed = true;
    });
  await tick();
  assert.equal(completed, false);
  release();
  await work;
  assert.equal(completed, true);
});
test("post-commit notification failure is handled rather than becoming an unhandled rejection", async () => {
  const pending = [];
  await push.completeNotification(
    Promise.reject(Error("synthetic notification failure")),
    (p) => pending.push(p),
  );
  await Promise.all(pending);
  assert.equal(pending.length, 1);
});
