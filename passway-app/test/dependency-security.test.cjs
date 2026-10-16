'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.env.PASSWAY_DEPENDENCY_ROOT || path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'package.json'));
const forge = req('node-forge');
const braces = req('braces');

test('RSA rejects extra DigestAlgorithm elements with real padding checks enabled', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 3 });
  const privateKey = forge.pki.privateKeyFromPem(pair.privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ type: 'spki', format: 'pem' }));
  const asn1 = forge.asn1, U = asn1.Class.UNIVERSAL, T = asn1.Type;
  const digest = forge.md.sha256.create().update('Passway public regression fixture').digest().getBytes();
  const algorithm = [asn1.create(U, T.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()), asn1.create(U, T.NULL, false, '')];
  for (const extra of [asn1.create(U, T.OCTETSTRING, false, 'unconsumed'), asn1.create(U, T.SEQUENCE, true, [])]) {
    const malformed = asn1.toDer(asn1.create(U, T.SEQUENCE, true, [asn1.create(U, T.SEQUENCE, true, [...algorithm, extra]), asn1.create(U, T.OCTETSTRING, false, digest)])).getBytes();
    const signature = privateKey.sign(malformed, 'NONE');
    assert.throws(() => publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
  }
});

test('RSA valid SHA-256 signatures retain native crypto interoperability', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const message = Buffer.from('Passway signature compatibility fixture');
  const privateKey = forge.pki.privateKeyFromPem(pair.privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ type: 'spki', format: 'pem' }));
  const digest = forge.md.sha256.create().update(message.toString()).digest().getBytes();
  assert.equal(publicKey.verify(digest, crypto.sign('sha256', message, pair.privateKey).toString('binary')), true);
  const signature = privateKey.sign(forge.md.sha256.create().update(message.toString()));
  assert.equal(crypto.verify('sha256', message, pair.publicKey, Buffer.from(signature, 'binary')), true);
});

for (const operation of ['compile', 'expand', 'stringify']) {
  test(`braces ${operation} rejects deep and cyclic ASTs without stack exhaustion`, () => {
    let ast = { type: 'text', value: 'x' };
    for (let i = 0; i < 12000; i++) ast = { type: 'root', nodes: [ast] };
    assert.throws(() => braces[operation](ast), SyntaxError);
    const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
    assert.throws(() => braces[operation](cycle), SyntaxError);
  });
}
test('braces parser rejects deeply nested braces and parentheses', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) assert.throws(() => braces.parse(open.repeat(4000) + 'x' + close.repeat(4000)), SyntaxError);
});
test('braces preserves normal ranges, nested alternatives, and shared acyclic nodes', () => {
  assert.deepEqual(braces.expand('a/{1..3}/{x,y}'), ['a/1/x', 'a/1/y', 'a/2/x', 'a/2/y', 'a/3/x', 'a/3/y']);
  const leaf = { type: 'text', value: 'a' };
  assert.equal(braces.stringify({ type: 'root', nodes: [leaf, leaf] }), 'aa');
  assert.doesNotThrow(() => braces.compile('{'.repeat(64) + 'x,y' + '}'.repeat(64)));
});
