---
quick_id: 261004-rdf
type: quick
autonomous: true
files_modified:
  - lib/thinx/device.js (runDeviceTransformers ~522-760 and its request options ~620-650)
  - spec/jasmine/DeviceTransformersSpec.js (new, local)
must_haves:
  truths:
    - "The API posts transformer jobs to the transformer service, not localhost: target comes from env TRANSFORMER_URL (default http://transformer:7474 — the swarm service name/port verified live 2026-10-04: API→transformer:7474 POST /do answered 200, localhost:7475 and transformer:7475 ECONNREFUSED); ENVIRONMENT=test keeps today's local target so CI specs still work; URL is parsed once and only http/https accepted"
    - "runDeviceTransformers is safe for every call shape (reg/res/callback may be null): no reg.status on null, no undeclared udid, the transformer response handler uses the device's udid, and no stale write-back: when there are no transformers or the request fails, it never writes back a device document read before a concurrent edit (re-read or patch only the fields it changes)"
    - "A transformer result updates only device.status (transformed) via the normal update path; failure/timeout leaves status untouched and logs one reason line (no device docs, owner ids, code or status values in logs)"
    - "HTTP check-in path behaviour for devices without transformers is unchanged (callback/response exactly once)"
    - "MQTT-triggered transformers stay hard off (messenger.js unchanged) — record in SUMMARY what remains before enabling them"
---

# Quick 261004-rdf: API reaches the transformer service; runDeviceTransformers null-safe

<objective>
Operator 2026-10-04: queue the transformer prerequisite fix. Today no transformer runs in production: device.js posts to hostname 'localhost' port app_config.lambda (7475 in prod config) → ECONNREFUSED; the transformer service listens on transformer:7474 (docker-swarm.yml service `transformer`, network internal). Also fix the bugs recorded in .planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md §(3) prerequisite 1 (read it). Check services/transformer/transformer.js for the request/response contract (POST /do {jobs:[…]}, response shape) and match it. Note: transformer service limits are cpus 0.05 / 64M and the sandbox timeout is 1 s — measure a trivial transform's latency in the SUMMARY if you can run the transformer locally (cd services/transformer; it is a submodule — do NOT commit there), and flag if the CPU cap makes the 1 s budget unrealistic.
</objective>

<tasks>
<task type="auto" tdd="true"><name>failing local spec</name><action>LOCAL spec with an in-process HTTP stub standing in for the transformer (and stubbed devicelib): target URL from TRANSFORMER_URL; default when unset (non-test) is http://transformer:7474; transform applied to status; no transformers → no stale write-back; null reg/res/callback paths don't throw; transformer error/timeout → status unchanged, one log line without sensitive data. Commit spec-only; must fail first.</action></task>
<task type="auto"><name>fix</name><action>Implement in lib/thinx/device.js. Update the gated-writes todo prerequisite 1 status. Commit code only.</action></task>
</tasks>
