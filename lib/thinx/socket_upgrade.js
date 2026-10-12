/** This THiNX Device Management API module admits WebSocket upgrades and tracks live sockets per owner. */

// Phase 43 (NOTIF-02). Several console tabs of one owner open sockets on the same
// `/<owner>` path, so upgrades are tracked per connection, not per path: each raw
// socket of a verified owner joins that owner's Set at admission and leaves it on
// its own 'close' (REFACTOR-03 release guarantee, per connection). An upgrade
// without a verified owner is not tracked; SocketSession.accept closes it 1008.
// Delivery is not done here: Messenger.sendToOwner owns it (D-06).
// Never logs cookies, session ids, URLs or frames.

const Util = require("./util");
const SocketSession = require("./socket_session");

module.exports = class SocketUpgrade {

	// options: { wss, sessionParser }
	constructor(options) {
		const o = ((typeof (options) === "object") && (options !== null)) ? options : {};
		this.wss = o.wss;
		this.sessionParser = o.sessionParser;
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
		if (owner !== null) this._track(owner, socket);

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
};

// Five Legacy tabs at two sockets each (owner socket + log socket).
module.exports.MAX_SOCKETS_PER_OWNER = 10;
