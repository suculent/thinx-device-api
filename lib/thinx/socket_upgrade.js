/** This THiNX Device Management API module admits WebSocket upgrades and tracks live sockets per owner. */

// Phase 43 (NOTIF-02). Several console tabs of one owner open sockets on the same
// `/<owner>` path, so upgrades are tracked per connection, not per path: each raw
// socket of a verified owner joins that owner's Set at admission and leaves it on
// its own 'close' (REFACTOR-03 release guarantee, per connection). An owner holds
// at most maxSocketsPerOwner live sockets (D-07); a further upgrade is answered
// 429 before the handshake. An upgrade without a verified owner is not tracked;
// SocketSession.accept closes it 1008.
// Delivery is not done here: Messenger.sendToOwner owns it (D-06).
// Never logs cookies, session ids, URLs or frames.

const Util = require("./util");
const SocketSession = require("./socket_session");

// Five Legacy tabs at two sockets each (owner socket + log socket).
const MAX_SOCKETS_PER_OWNER = 10;

// WR-01: ping interval. A socket that has not answered the previous ping by the
// next tick is terminated, so a vanished peer is reaped within two intervals.
const HEARTBEAT_INTERVAL_MS = 30000;

module.exports = class SocketUpgrade {

	// options: { wss, sessionParser, maxSocketsPerOwner (optional, default MAX_SOCKETS_PER_OWNER) }
	constructor(options) {
		const o = ((typeof (options) === "object") && (options !== null)) ? options : {};
		this.wss = o.wss;
		this.sessionParser = o.sessionParser;
		const cap = o.maxSocketsPerOwner;
		this.maxSocketsPerOwner = (Number.isInteger(cap) && (cap > 0)) ? cap : MAX_SOCKETS_PER_OWNER;
		this.owners = new Map(); // owner -> Set of raw sockets
	}

	// The http server's 'upgrade' handler.
	handle(request, socket, head) {
		// The http server drops its own 'error' listener before emitting 'upgrade';
		// a reset during the session parse must not become an uncaught error.
		// 'close' follows the error and releases the slot.
		socket.on("error", () => { /* closed below or by the peer */ });
		try {
			this.sessionParser(request, {}, () => this._admit(request, socket, head));
		} catch (_e) {
			console.log("☣️ [error] [ws] upgrade failed: session parse error");
			socket.destroy();
		}
	}

	_admit(request, socket, head) {
		const cookies = request.headers.cookie;

		if (Util.isDefined(cookies)) {
			// other x-thx cookies are now deprecated and can be removed
			if (cookies.indexOf("x-thx-core") === -1) {
				console.log("Should destroy socket, access unauthorized.", Util.redactCookieHeader(cookies));
				socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
				socket.destroy();
				return;
			}
		}

		// The TCP peer left during the session parse: its 'close' may already have
		// fired, so tracking it now would leak a slot.
		if (socket.destroyed || (socket.writable === false)) {
			socket.destroy();
			return;
		}

		const owner = SocketSession.verifiedOwner(request);
		if (owner !== null) {
			// Check and insert run synchronously, so concurrent upgrades cannot both
			// pass a full owner.
			if (this.ownerSocketCount(owner) >= this.maxSocketsPerOwner) {
				console.log(`⚠️ [warning] [ws] upgrade refused: per-owner socket limit (${this.maxSocketsPerOwner}) reached`);
				socket.once("finish", () => socket.destroy());
				socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
				return;
			}
			this._track(owner, socket);
		}

		try {
			this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit("connection", ws, request));
		} catch (_e) {
			if (owner !== null) this._release(owner, socket);
			console.log("☣️ [error] [ws] upgrade failed");
			socket.destroy();
		}
	}

	_track(owner, socket) {
		let sockets = this.owners.get(owner);
		if (typeof (sockets) === "undefined") {
			sockets = new Set();
			this.owners.set(owner, sockets);
		}
		sockets.add(socket);
		socket.once("close", () => this._release(owner, socket));
	}

	// Releases only this socket's slot.
	_release(owner, socket) {
		const sockets = this.owners.get(owner);
		if (typeof (sockets) === "undefined") return;
		sockets.delete(socket);
		if (sockets.size === 0) this.owners.delete(owner);
	}

	ownerSocketCount(owner) {
		if (typeof (owner) !== "string") return 0;
		const sockets = this.owners.get(owner);
		return (typeof (sockets) === "undefined") ? 0 : sockets.size;
	}

	liveSocketCount() {
		let count = 0;
		for (const sockets of this.owners.values()) count += sockets.size;
		return count;
	}

	// WR-01: the heartbeat that reaps dead peers on `wss`. Owner slots are released
	// only on the raw socket's 'close' (_track), and a peer that disappears without
	// a FIN (sleep, network switch, killed browser) never sends one, so its slot
	// would count against the per-owner cap until TCP gives up (15-30 min). Every
	// tick marks each socket not alive and pings it; a pong marks it alive again;
	// a socket still not alive at the next tick is terminated. terminate()
	// destroys the raw socket, whose 'close' releases the slot and the messenger
	// subscription (REFACTOR-03). Browsers answer pings on their own.
	// Returns the interval handle; intervalMs is injectable for specs.
	static startHeartbeat(wss, intervalMs) {
		const ms = (Number.isInteger(intervalMs) && (intervalMs > 0)) ? intervalMs : HEARTBEAT_INTERVAL_MS;
		wss.on("connection", (ws) => {
			ws.isAlive = true;
			ws.on("pong", () => { ws.isAlive = true; });
		});
		return setInterval(() => SocketUpgrade.heartbeatTick(wss), ms);
	}

	static heartbeatTick(wss) {
		if ((typeof (wss) !== "object") || (wss === null) || (typeof (wss.clients) === "undefined")) return;
		wss.clients.forEach((ws) => {
			if (ws.isAlive === false) {
				console.log("🔨 [debug] [ws] terminating a socket that did not answer the last ping");
				ws.terminate();
				return;
			}
			ws.isAlive = false;
			try {
				ws.ping();
			} catch (_e) {
				// not open (closing); the next tick terminates it
			}
		});
	}
};

module.exports.MAX_SOCKETS_PER_OWNER = MAX_SOCKETS_PER_OWNER;
module.exports.HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;
