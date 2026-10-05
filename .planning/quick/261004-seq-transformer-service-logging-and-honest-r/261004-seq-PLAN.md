---
quick_id: 261004-seq
type: quick
autonomous: true
repo: services/transformer (thinx-cloud/transformer, branch main; CI publishes thinxcloud/transformer:latest from main, Swarmpit autoredeploys thinx_transformer)
must_haves:
  truths:
    - "The service never logs transformer code, statuses (input or output), device objects, request objects ({ req }), owner ids or raw exception messages that may contain them: transformer.js lines ~113 ({ req }), ~137 (sandbox log() passthrough), ~142 (Returned args), ~175, ~212, ~245, ~267 (Invalid code), ~273 (Evaluating code), ~275, ~279, ~289 — replace with job id + reason codes; keep startup/worker lifecycle lines"
    - "Transformer-authored log(...) output from inside the sandbox is NOT forwarded to stdout verbatim (it may carry device data); either drop it or forward a capped count/length marker only"
    - "The /do response is honest: success → {output: <string>} with NO error field; failure (invalid code, sandbox error, timeout) → {error: <reason code>} and either no output or the original status explicitly marked (choose the shape compatible with the API's Device.transformerResult from parent repo lib/thinx/device.js — read it; the API must keep treating success/failure correctly, and a timeout must no longer look like success)"
    - "Existing jest tests (npm test with ENVIRONMENT=test) stay green; new tests pin no-sensitive-logging and the response shapes"
---
# Quick 261004-seq: transformer service logging and honest result
From 261004-rdf SUMMARY (read it): the service logs code, returned status and {req}, and always answers error:"transformer_error" even on success; on sandbox timeout it returns the input status as output, which looks like success. Fix in services/transformer only. TDD. If the API side (parent lib/thinx/device.js transformerResult) needs a matching change, do NOT edit the parent — report exactly what is needed.
