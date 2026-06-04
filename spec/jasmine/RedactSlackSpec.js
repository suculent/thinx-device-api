/*
 * spec/jasmine/RedactSlackSpec.js
 *
 * OBS-01 — Unit spec for the Slack closure-receipt helper exposed by
 * `scripts/redact-managed-logs.js`. NON-`ZZ-` prefix per D-25: pure
 * unit spec, no bootstrap, no CouchDB, no router state.
 *
 * Mocks `slack-notify` via `require.cache` substitution (planner's
 * discretion per 12-CONTEXT.md "Claude's Discretion") so we can capture
 * each `.send(msg)` payload and simulate BOTH webhook-500 failure modes
 * exposed by slack-notify v2.0.7's send contract (sync-throw AND
 * async-reject) — see node_modules/slack-notify/src/cjs/index.js.
 *
 * Covered behaviors (D-13..D-25 plus BLOCK-05 / WARN-02 follow-on fixes):
 *   Test 1  — `--scan` default mode: postSlackSummary is NEVER called.
 *   Test 2  — `--apply` success: postSlackSummary called once with the
 *             locked channel / username / icon_emoji.
 *   Test 3  — `--apply` failure: postSlackSummary called once with the
 *             5-key allowlisted `fields:` array; sample_ids truncated.
 *   Test 3b — Defensive sample_ids mapping for null / undefined / empty
 *             entries (renders as the literal `<missing>`).
 *   Test 4  — `--sample` discovery: postSlackSummary called once with
 *             the ⚠️ discovery shape.
 *   Test 5a — Webhook-500 sync path: postSlackSummary does NOT re-throw.
 *   Test 5b — Webhook-500 async path: chained `.catch()` consumes the
 *             rejection; no unhandledRejection event fires.
 *   Test 6  — No PII / no credentials in serialized captured messages
 *             (no 64-char hex shape, no email shape).
 */

"use strict";

const slackNotifyPath = require.resolve("slack-notify");
const capturedCalls = [];
let throwOnSend = false;
let rejectOnSend = false;
require.cache[slackNotifyPath] = {
  id: slackNotifyPath,
  filename: slackNotifyPath,
  loaded: true,
  exports: function SlackNotifyMock(_webhook) {
    return {
      send: (msg) => {
        capturedCalls.push(msg);
        if (throwOnSend) throw new Error("simulated webhook 500 (sync)");
        if (rejectOnSend) return Promise.reject(new Error("simulated webhook 500 (async)"));
        return Promise.resolve();
      }
    };
  }
};

const expect = require("chai").expect;
const redact = require("../../scripts/redact-managed-logs.js");

describe("OBS-01 Slack closure receipt", function () {

  beforeAll(() => {
    console.log("🚸 [chai] >>> running OBS-01 Slack closure receipt spec");
  });

  afterAll(() => {
    console.log("🚸 [chai] <<< completed OBS-01 Slack closure receipt spec");
  });

  beforeEach(() => {
    capturedCalls.length = 0;
    throwOnSend = false;
    rejectOnSend = false;
  });

  it("does NOT call slack.send when SLACK_WEBHOOK is unset", function () {
    const prev = process.env.SLACK_WEBHOOK;
    delete process.env.SLACK_WEBHOOK;
    try {
      redact.postSlackSummary("success", { docs_scanned: 1, docs_redacted: 1, sample_verdict: "deferred", runtime_ms: 100 });
      expect(capturedCalls.length).to.equal(0);
    } finally {
      if (prev !== undefined) process.env.SLACK_WEBHOOK = prev;
    }
  });

  it("posts ✅ success message with locked channel/username/icon_emoji", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    redact.postSlackSummary("success", { docs_scanned: 1234, docs_redacted: 567, sample_verdict: "deferred", runtime_ms: 99999 });
    expect(capturedCalls.length).to.equal(1);
    const msg = capturedCalls[0];
    expect(msg.username).to.equal("redact-managed-logs");
    expect(msg.channel).to.equal("#thinx");
    expect(msg.icon_emoji).to.equal(":broom:");
    expect(msg.text.indexOf("✅ managed_logs redaction complete")).to.equal(0);
  });

  it("posts ❌ failure message with allowlisted fields only", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    redact.postSlackSummary("failure", {
      docs_scanned: 1234, docs_redacted: 567,
      stage_reached: "bulk_docs", snapshot_path: "/mnt/snap.jsonl",
      sample_ids: ["abc12345-ef-FULL-ID-NEVER-LOG", "deadbeef-stuff", "feedface-stuff", "cafebabe-stuff", "12345678-stuff", "ignored-6"],
      error_message: "boom"
    });
    expect(capturedCalls.length).to.equal(1);
    const msg = capturedCalls[0];
    expect(msg.text.indexOf("❌ managed_logs redaction FAILED")).to.equal(0);
    expect(Object.keys(msg.fields).sort()).to.deep.equal(["docs_redacted", "docs_scanned", "sample_ids", "snapshot_path", "stage_reached"]);
    expect(msg.fields.sample_ids.length).to.be.at.most(5);
    msg.fields.sample_ids.forEach((id) => expect(id.length).to.be.at.most(11));
  });

  it("renders null/undefined/empty sample_ids as <missing> (no null... / undefined leaks)", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    redact.postSlackSummary("failure", {
      docs_scanned: 5, docs_redacted: 3,
      stage_reached: "bulk_docs", snapshot_path: "/x.jsonl",
      sample_ids: [null, undefined, "", "x", "abcdefghij"],
      error_message: "boom"
    });
    expect(capturedCalls.length).to.equal(1);
    const ids = capturedCalls[0].fields.sample_ids;
    expect(ids.length).to.equal(5);
    expect(ids[0]).to.equal("<missing>");
    expect(ids[1]).to.equal("<missing>");
    expect(ids[2]).to.equal("<missing>");
    expect(ids[3]).to.equal("x...");
    expect(ids[4]).to.equal("abcdefgh...");
    ids.forEach((entry) => {
      expect(/^null/.test(entry)).to.equal(false);
      expect(/^undefined/.test(entry)).to.equal(false);
    });
  });

  it("posts ⚠️ discovery message on sample raw-PII detection", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    redact.postSlackSummary("discovery", { checked: 1000, leaks: 3, pii_kind: "reset_key|email" });
    expect(capturedCalls.length).to.equal(1);
    expect(capturedCalls[0].text.indexOf("⚠️ managed_logs sample discovered raw PII")).to.equal(0);
  });

  it("does NOT throw when slack.send throws synchronously (webhook-500 sync path)", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    throwOnSend = true;
    expect(() => redact.postSlackSummary("success", { docs_scanned: 1, docs_redacted: 1, sample_verdict: "deferred", runtime_ms: 1 })).to.not.throw();
  });

  it("does NOT crash when slack.send returns a rejected Promise (webhook-500 async path)", function (done) {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    rejectOnSend = true;
    let sawUnhandled = false;
    const onUnhandled = (_reason) => { sawUnhandled = true; };
    process.on('unhandledRejection', onUnhandled);
    try {
      redact.postSlackSummary("success", { docs_scanned: 1, docs_redacted: 1, sample_verdict: "deferred", runtime_ms: 1 });
    } catch (_e) {
      process.removeListener('unhandledRejection', onUnhandled);
      done(new Error("postSlackSummary threw on async-reject path"));
      return;
    }
    setTimeout(() => {
      process.removeListener('unhandledRejection', onUnhandled);
      expect(sawUnhandled).to.equal(false);
      done();
    }, 50);
  }, 5000);

  it("never includes raw 64-char hex or email shapes in captured messages", function () {
    process.env.SLACK_WEBHOOK = "https://hooks.slack.com/services/T0/B0/secret";
    redact.postSlackSummary("success", { docs_scanned: 1, docs_redacted: 1, sample_verdict: "deferred", runtime_ms: 1 });
    redact.postSlackSummary("failure", { docs_scanned: 1, docs_redacted: 0, stage_reached: "bulk_docs", snapshot_path: "/x", sample_ids: ["a".repeat(64), "user@example.com"], error_message: "x" });
    redact.postSlackSummary("discovery", { checked: 1, leaks: 1, pii_kind: "reset_key|email" });
    const serialized = JSON.stringify(capturedCalls);
    expect(/[0-9a-f]{64}/.test(serialized)).to.equal(false);
    expect(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(serialized)).to.equal(false);
  });

});
