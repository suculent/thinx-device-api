#!/usr/bin/env node
/*
 * scripts/influx-stats-probe.js
 *
 * OPS-INFLUX-02 / OPS-INFLUX-03 (phase 27): READ-ONLY, aggregate-only probe
 * for the InfluxDB 2 statistics bucket. Production steps (27-05..27-07) run it
 * inside the API image to prove the token, the bucket, its retention, the
 * migrated counts and fresh writes, without printing anything secret.
 *
 * Usage:
 *   node scripts/influx-stats-probe.js [--bucket stats|stats/autogen]
 *                                      [--window-start ISO --window-stop ISO]
 *
 *   --bucket        the bucket to inspect (default `stats`)
 *   --window-*      an absolute window [start, stop), both flags together,
 *                   start strictly before stop
 *
 * Configuration (same as the API): INFLUXDB_URL, INFLUXDB_ORG, and the token
 * from /run/secrets/INFLUXDB_TOKEN or env INFLUXDB_TOKEN. It needs no
 * /mnt/data/conf: it loads only lib/thinx/influx.js, event_taxonomy.js and
 * secrets.js.
 *
 * Output, one `key=value` line each, in this order:
 *   token_present, bucket, bucket_exists, bucket_retention_s,
 *   legacy_bucket_present, bucket_names, count_all_total,
 *   count_all_<KPI> x8, count_90d_<KPI> x8, count_7d_<KPI> x8,
 *   count_24h_<KPI> x8, count_10m_<KPI> x8,
 *   [window, count_window_total, count_window_<KPI> x8],
 *   owners_7d
 * then exactly one final line:
 *   INFLUX-STATS-PROBE OK
 *   INFLUX-STATS-PROBE FAIL reason=<no_token|bucket_absent|retention_<n>|query_failed|<short token>>
 * OK needs a token, the bucket, every query answered and, for `stats`, a
 * retention of exactly 7776000 s (90 days).
 *
 * Exit codes: 0 OK, 1 FAIL, 2 usage error.
 *
 * It never writes, never runs the boot ensure step, and never prints the
 * token, the URL, an owner id, a tag value or a non-taxonomy measurement name.
 * Connector output is swallowed; failures surface only as short reason tokens.
 */

"use strict";

const InfluxConnector = require("../lib/thinx/influx.js");
const EventTaxonomy = require("../lib/thinx/event_taxonomy.js");
const { readSecret } = require("../lib/thinx/secrets.js");

const BUCKETS = ["stats", "stats/autogen"];
const RETENTION_SECONDS = 7776000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const REASON = /^[A-Za-z0-9_.-]{1,40}$/;
const BUCKET_NAME = /^[A-Za-z0-9_./-]{1,64}$/;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const PERIODS = [
	["all", () => new Date(0)],
	["90d", (now) => new Date(now - 90 * DAY)],
	["7d", (now) => new Date(now - 7 * DAY)],
	["24h", (now) => new Date(now - DAY)],
	["10m", (now) => new Date(now - 10 * 60 * 1000)]
];
const USAGE = "usage: node scripts/influx-stats-probe.js [--bucket stats|stats/autogen] [--window-start ISO --window-stop ISO]";

const out = [];
const emit = (line) => { out.push(line); };
const token = (r) => (typeof r === "string" && REASON.test(r)) ? r : "error";

function parseArgs(argv) {
	const args = { bucket: "stats", start: null, stop: null };
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const val = argv[i + 1];
		if (flag === "--bucket" || flag === "--window-start" || flag === "--window-stop") {
			if (typeof val !== "string" || val.indexOf("--") === 0) return null;
			i++;
			if (flag === "--bucket") {
				if (BUCKETS.indexOf(val) === -1) return null;
				args.bucket = val;
			} else {
				if (!ISO.test(val)) return null;
				const d = new Date(val);
				if (Number.isNaN(d.getTime())) return null;
				if (flag === "--window-start") args.start = d; else args.stop = d;
			}
		} else {
			return null;
		}
	}
	if ((args.start === null) !== (args.stop === null)) return null;
	if (args.start !== null && args.start.getTime() >= args.stop.getTime()) return null;
	return args;
}

// The connector may log (client logger, disabled line); none of it is probe
// output. Everything the probe prints goes through emit().
function silenceConsole() {
	const drop = () => { };
	console.log = drop; console.info = drop; console.warn = drop; console.error = drop; console.debug = drop;
}

function finish(code, final) {
	process.stdout.write(out.concat([final]).join("\n") + "\n", () => process.exit(code));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args) {
		emit(USAGE);
		return finish(2, "INFLUX-STATS-PROBE FAIL reason=usage");
	}
	silenceConsole();

	const hasToken = Boolean(readSecret("INFLUXDB_TOKEN"));
	emit(`token_present=${hasToken ? 1 : 0}`);
	emit(`bucket=${args.bucket}`);
	if (!hasToken) return finish(1, "INFLUX-STATS-PROBE FAIL reason=no_token");

	const status = await InfluxConnector.bucketStatus({ bucket: args.bucket });
	if (!status.ok) {
		emit("bucket_exists=na");
		return finish(1, `INFLUX-STATS-PROBE FAIL reason=${token(status.reason)}`);
	}
	emit(`bucket_exists=${status.exists ? 1 : 0}`);
	emit(`bucket_retention_s=${status.retentionSeconds}`);
	emit(`legacy_bucket_present=${status.legacyPresent ? 1 : 0}`);
	emit(`bucket_names=${status.names.map((n) => BUCKET_NAME.test(n) ? n : "?").join(",")}`);
	if (!status.exists) return finish(1, "INFLUX-STATS-PROBE FAIL reason=bucket_absent");

	const influx = new InfluxConnector("stats");
	const opts = { bucket: args.bucket };
	const kpis = EventTaxonomy.names();
	const now = Date.now();
	let failed = null;
	const note = (r) => { if (!r.ok && failed === null) failed = token(r.reason); };

	const all = await influx.countAll(new Date(0), opts);
	note(all);
	emit(`count_all_total=${all.total}`);

	for (const [label, startOf] of PERIODS) {
		const r = await influx.countsDetailed(null, startOf(now), opts);
		note(r);
		kpis.forEach((k) => emit(`count_${label}_${k}=${r.counts[k][0]}`));
	}

	if (args.start !== null) {
		const wopts = { bucket: args.bucket, stop: args.stop };
		emit(`window=${args.start.toISOString()}/${args.stop.toISOString()}`);
		const total = await influx.countAll(args.start, wopts);
		note(total);
		emit(`count_window_total=${total.total}`);
		const r = await influx.countsDetailed(null, args.start, wopts);
		note(r);
		kpis.forEach((k) => emit(`count_window_${k}=${r.counts[k][0]}`));
	}

	const owners = await influx.distinctOwners(new Date(now - 7 * DAY), opts);
	note(owners);
	emit(`owners_7d=${owners.n}`);

	if (failed !== null) return finish(1, "INFLUX-STATS-PROBE FAIL reason=query_failed");
	if (args.bucket === "stats" && status.retentionSeconds !== RETENTION_SECONDS) {
		return finish(1, `INFLUX-STATS-PROBE FAIL reason=retention_${status.retentionSeconds}`);
	}
	return finish(0, "INFLUX-STATS-PROBE OK");
}

main().catch(() => finish(1, "INFLUX-STATS-PROBE FAIL reason=error"));
