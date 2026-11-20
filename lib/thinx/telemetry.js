/*
 * Device telemetry normalisation: RSSI, SNR and location from device input.
 *
 * Device payloads (the HTTP registration body and the MQTT status message) are untrusted.
 * These helpers return a number that is safe to store and render, or null when the
 * input is absent or invalid. Callers write a field only when the helper returns a number,
 * so the last good value is kept.
 *
 * Accepted input forms:
 * - a finite JSON number;
 * - a strict decimal string such as "-67" or "50.08804". Legacy THiNXLib and Sigfox
 *   bodies sometimes send strings.
 *
 * Location:
 * - lat must be in [-90, 90] and lon in [-180, 180];
 * - 0,0 is rejected, because it is the "no fix" placeholder;
 * - coordinates are rounded to 6 decimals (about 0.1 m).
 */

const DECIMAL_RE = /^-?\d{1,4}(\.\d{1,12})?$/;

const RSSI_MIN_DBM = -150;
const RSSI_MAX_DBM = 0;
const SNR_MIN_DB = -50;
const SNR_MAX_DB = 60;

module.exports = class Telemetry {

	static toNumber(value) {
		if ((typeof (value) === "number") && Number.isFinite(value)) return value;
		if ((typeof (value) === "string") && DECIMAL_RE.test(value)) {
			const n = Number(value);
			return Number.isFinite(n) ? n : null;
		}
		return null;
	}

	// Integer dBm in [-150, 0], or null.
	static rssi(value) {
		const n = Telemetry.toNumber(value);
		if (n === null) return null;
		const dbm = Math.round(n);
		return ((dbm >= RSSI_MIN_DBM) && (dbm <= RSSI_MAX_DBM)) ? dbm : null;
	}

	// dB in [-50, 60] rounded to 0.1, or null.
	static snr(value) {
		const n = Telemetry.toNumber(value);
		if ((n === null) || (n < SNR_MIN_DB) || (n > SNR_MAX_DB)) return null;
		return Math.round(n * 10) / 10;
	}

	// { lat, lon } rounded to 6 decimals, or null when either is invalid or both are 0.
	static location(lat_value, lon_value) {
		const lat = Telemetry.toNumber(lat_value);
		const lon = Telemetry.toNumber(lon_value);
		if ((lat === null) || (lon === null)) return null;
		if ((Math.abs(lat) > 90) || (Math.abs(lon) > 180)) return null;
		if ((lat === 0) && (lon === 0)) return null;
		const round6 = (v) => Math.round(v * 1e6) / 1e6;
		return { lat: round6(lat), lon: round6(lon) };
	}

	static isPlainObject(o) {
		return (typeof (o) === "object") && (o !== null) && !Array.isArray(o);
	}

	/*
	 * Telemetry fields from an MQTT status message (sim-cam / THiNX status shape):
	 * - RSSI: `rssi_dbm`, or else `rssi`;
	 * - SNR: `snr`;
	 * - location: `gnss` with `fix: true` and its lat/lon, or else `last_fix` lat/lon,
	 *   or else top-level `lat`/`lon`.
	 * Returns only the valid fields. An empty object means there is nothing to write.
	 */
	static fromStatusMessage(message) {
		const out = {};
		if (!Telemetry.isPlainObject(message)) return out;

		const rssi = Telemetry.rssi(typeof (message.rssi_dbm) !== "undefined" ? message.rssi_dbm : message.rssi);
		if (rssi !== null) out.rssi = rssi;

		const snr = Telemetry.snr(message.snr);
		if (snr !== null) out.snr = snr;

		let loc = null;
		if (Telemetry.isPlainObject(message.gnss) && (message.gnss.fix === true)) {
			loc = Telemetry.location(message.gnss.lat, message.gnss.lon);
		}
		if ((loc === null) && Telemetry.isPlainObject(message.last_fix)) {
			loc = Telemetry.location(message.last_fix.lat, message.last_fix.lon);
		}
		if (loc === null) loc = Telemetry.location(message.lat, message.lon);
		if (loc !== null) {
			out.lat = loc.lat;
			out.lon = loc.lon;
		}
		return out;
	}

	/*
	 * Telemetry fields from an HTTP registration body: `rssi`, `snr`, `lat`, `lon`.
	 * Same validation rules as fromStatusMessage.
	 */
	static fromRegistration(reg) {
		const out = {};
		if (!Telemetry.isPlainObject(reg)) return out;
		const rssi = Telemetry.rssi(reg.rssi);
		if (rssi !== null) out.rssi = rssi;
		const snr = Telemetry.snr(reg.snr);
		if (snr !== null) out.snr = snr;
		const loc = Telemetry.location(reg.lat, reg.lon);
		if (loc !== null) {
			out.lat = loc.lat;
			out.lon = loc.lon;
		}
		return out;
	}
};
