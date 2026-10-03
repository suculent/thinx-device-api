/** This THiNX Device Management API module binds WebSocket connections to their session owner. */

// Quick 261003-v05. The owner of a socket is the session owner that
// express-session parsed at upgrade (request.session.owner), and it must equal
// the first URL path segment. Anything else is closed with 1008 right after the
// handshake and never gets a message listener or a registry entry. Frames act
// only as that verified owner; owner fields inside a frame are ignored.
// The frame dispatcher never throws: an exception in a 'message' listener is
// uncaught and used to take the whole API process down.

const Sanitka = require("./sanitka");

function pathSegments(url) {
	if (typeof (url) !== "string") return [];
	const pathname = url.split("?")[0].split("#")[0];
	return pathname.split("/").slice(1);
}

module.exports = class SocketSession {

	// Returns the verified owner of the upgrade request, or null. Never throws.
	static verifiedOwner(request) {
		try {
			if ((typeof (request) !== "object") || (request === null)) return null;
			const session = request.session;
			if ((typeof (session) !== "object") || (session === null)) return null;
			const owner = session.owner;
			if ((typeof (owner) !== "string") || (owner.length === 0)) return null;
			if (Sanitka.owner(owner) !== owner) return null;
			const segments = pathSegments(request.url);
			if (segments[0] !== owner) return null;
			return owner;
		} catch (_e) {
			return null;
		}
	}

	// Serves the socket when its owner is verified: registers it and attaches
	// the frame dispatcher. Returns the owner, or null after closing the socket.
	// ctx: { registry, blog, messenger, callback }
	static accept(ws, request, ctx) {
		const owner = SocketSession.verifiedOwner(request);
		if (owner === null) {
			console.log("ℹ️ [info] [ws] socket rejected: no verified session owner");
			try { ws.close(1008, "unauthorized"); } catch (_e) { /* already closed */ }
			return null;
		}

		ws.owner = owner;

		const id = pathSegments(request.url)[1];
		if ((typeof (id) === "string") && (id.length > 0)) {
			console.log("ℹ️ [info] Log socket", owner, "started...");
			ctx.registry[owner + "/" + id] = ws;
		} else {
			console.log("ℹ️ [info] Owner socket", owner, "started...");
			ctx.registry[owner] = ws;
		}

		ws.on("message", (data) => SocketSession.onMessage(ws, data, ctx));
		return owner;
	}

	// Dispatches one frame as the socket's verified owner. Never throws and
	// never logs the frame.
	static onMessage(ws, data, ctx) {
		try {
			if ((typeof (ws) !== "object") || (ws === null) || (typeof (ws.owner) !== "string")) return;
			const text = String(data);
			if (text.indexOf("{}") === 0) return; // skip empty messages

			let object;
			try {
				object = JSON.parse(text);
			} catch (_e) {
				return;
			}
			if ((typeof (object) !== "object") || (object === null) || Array.isArray(object)) return;

			const logtail = object.logtail;
			if ((typeof (logtail) === "object") && (logtail !== null)) {
				if (typeof (logtail.build_id) === "string") {
					// The output is the connection the frame arrived on; any owner_id
					// in the frame is ignored.
					ctx.blog.logtail(logtail.build_id, ws.owner, ws, ctx.callback);
				}
				return;
			}

			// The console sends {init: <owner>}; the value is ignored beyond its
			// type, the messenger is always initialized for the verified owner.
			if ((typeof (object.init) === "string") && (typeof (ctx.messenger) !== "undefined") && (ctx.messenger !== null)) {
				const owner = ws.owner;
				ctx.messenger.initWithOwner(owner, ws, (success, message_z) => {
					if (!success) {
						console.log(`ℹ️ [error] [ws] Messenger init on WS message failed: ${message_z}`);
					} else {
						console.log(`ℹ️ [info] Messenger successfully initialized for ${owner}`);
					}
				});
			}
		} catch (e) {
			console.log(`⚠️ [warning] [ws] message handling failed: ${(e && e.name) ? e.name : "error"}`);
		}
	}
};
