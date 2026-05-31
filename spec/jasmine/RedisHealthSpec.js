/* Standalone spec for lib/thinx/redis-health.js.
 *
 * Uses an EventEmitter stub to simulate the node-redis v5 client; injects a
 * fake SlackNotify factory so no live HTTP call is made. No bootstrap.js
 * dependency on a live Redis / CouchDB / Mosquitto.
 */

const EventEmitter = require('events');
const expect = require('chai').expect;
const RedisHealth = require('../../lib/thinx/redis-health');

function makeStubClient() {
  return new EventEmitter();
}

function makeSendSpy() {
  const calls = [];
  const send = (payload) => { calls.push(payload); };
  return { send, calls };
}

describe('RedisHealth notifier', function () {

  it('(H1) posts immediately on first error', function (done) {
    const client = makeStubClient();
    const spy = makeSendSpy();
    RedisHealth.attach(client, {
      webhook: 'https://example.invalid/hook',
      slackNotify: () => ({ send: spy.send }),
      now: () => 1_000_000,
      debounceMs: 1000
    });
    client.emit('error', new Error('socket disconnected'));
    // SlackNotify call path is synchronous in this stub.
    setImmediate(() => {
      expect(spy.calls.length).to.equal(1);
      const payload = spy.calls[0];
      // Accept either a string or a {text} object — the implementer chooses
      // the SlackNotify-compatible shape.
      const text = typeof payload === 'string' ? payload : (payload && payload.text);
      expect(text).to.be.a('string');
      expect(text.toLowerCase()).to.include('disconnect');
      done();
    });
  });

  it('(H2) debounces repeat errors within window', function (done) {
    const client = makeStubClient();
    const spy = makeSendSpy();
    let clock = 2_000_000;
    RedisHealth.attach(client, {
      webhook: 'https://example.invalid/hook',
      slackNotify: () => ({ send: spy.send }),
      now: () => clock,
      debounceMs: 1000
    });
    client.emit('error', new Error('first'));
    clock += 500;
    client.emit('error', new Error('second-within-window'));
    setImmediate(() => {
      expect(spy.calls.length).to.equal(1);
      done();
    });
  });

  it('(H3) posts a single recovery message on ready after outage', function (done) {
    const client = makeStubClient();
    const spy = makeSendSpy();
    let clock = 3_000_000;
    RedisHealth.attach(client, {
      webhook: 'https://example.invalid/hook',
      slackNotify: () => ({ send: spy.send }),
      now: () => clock,
      debounceMs: 1000
    });
    client.emit('error', new Error('went down'));
    clock += 2000; // outside debounce window
    client.emit('ready');
    setImmediate(() => {
      expect(spy.calls.length).to.equal(2);
      const second = spy.calls[1];
      const text = typeof second === 'string' ? second : (second && second.text);
      expect(text).to.be.a('string');
      expect(text.toLowerCase()).to.include('reconnect');
      done();
    });
  });

  it('(H4) no-op when webhook unset', function (done) {
    const client = makeStubClient();
    const spy = makeSendSpy();
    RedisHealth.attach(client, {
      webhook: null,
      slackNotify: () => ({ send: spy.send }),
      now: () => 4_000_000,
      debounceMs: 1000
    });
    client.emit('error', new Error('any'));
    setImmediate(() => {
      expect(spy.calls.length).to.equal(0);
      done();
    });
  });

});
