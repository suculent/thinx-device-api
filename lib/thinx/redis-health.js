/* Redis health notifier — Slack-debounced.
 *
 * Subscribes to the node-redis v5 base client's 'error' / 'end' / 'ready'
 * events and emits a single Slack notification per outage:
 *
 *   - First disconnect within `debounceMs`         -> post "disconnected"
 *   - Subsequent disconnects within the window     -> suppressed
 *   - First 'ready' after an outage                -> post "reconnected"
 *
 * Re-uses the existing slack-notify integration from lib/thinx/notifier.js
 * (same SLACK_WEBHOOK env var, same `slack-notify` npm package). Missing
 * webhook means the attach() call logs a single warning at startup and
 * thereafter no-ops; it never throws.
 *
 * Introduced by quick task 260531-n72 to give operators a Slack signal the
 * moment Redis goes dark instead of waiting for a deploy-loop alert.
 */

const DEFAULT_DEBOUNCE_MS = 5 * 60 * 1000;

function safeReason(arg) {
    if (!arg) return 'unknown';
    if (arg instanceof Error) return arg.message || arg.name || 'error';
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); } catch (_e) { return String(arg); }
}

/**
 * Attach health listeners to a node-redis v5 base client.
 *
 * @param {object} client  node-redis base client (EventEmitter — 'error',
 *                         'end', 'ready')
 * @param {object} [opts]
 * @param {string|null} [opts.webhook]   Override SLACK_WEBHOOK (tests).
 * @param {Function}   [opts.slackNotify] Override the slack-notify factory
 *                                       (tests). Must return { send(payload) }.
 * @param {Function}   [opts.now]         Override Date.now (tests).
 * @param {number}     [opts.debounceMs]  Debounce window for repeat
 *                                        disconnect messages. Default 5min.
 * @returns {{detach: Function}}          Handle to remove listeners.
 */
function attach(client, opts) {
    opts = opts || {};
    const webhook = ('webhook' in opts) ? opts.webhook : process.env.SLACK_WEBHOOK;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const debounceMs = typeof opts.debounceMs === 'number' ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;

    // Resolve the slack-notify factory lazily — mirrors lib/thinx/notifier.js
    // (require'd once at use-time so tests can inject a stub without forcing
    // the real package to load HTTP code paths).
    let slackFactory = opts.slackNotify;
    if (!slackFactory) {
        try {
            slackFactory = require('slack-notify');
        } catch (e) {
            console.log('☣️ [error] [redis-health] slack-notify package unavailable:', e && e.message ? e.message : e);
        }
    }

    if (!webhook) {
        console.log('ℹ️ [info] [redis-health] SLACK_WEBHOOK not set — Redis outage notifications disabled');
    }

    // Per-process outage state. A single timestamp + flag is sufficient: this
    // module is attached exactly once per process at boot from thinx-core.js,
    // so we do not need to disambiguate multiple clients.
    let lastDownPostedAt = 0;
    let inOutage = false;

    const slack = (webhook && slackFactory) ? slackFactory(webhook) : null;

    function postSafely(text) {
        if (!slack) return; // webhook missing -> already warned at attach
        try {
            slack.send({
                text: text,
                username: 'redis-health',
                icon_emoji: ':rotating_light:',
                channel: '#thinx'
            });
        } catch (e) {
            console.log('☣️ [error] [redis-health] SlackNotify.send threw:', e && e.message ? e.message : e);
        }
    }

    function handleDisconnect(eventName, reasonArg) {
        const reason = safeReason(reasonArg);
        console.log(`☣️ [error] [redis-health] Redis client ${eventName}: ${reason}`);
        const ts = now();
        if (ts - lastDownPostedAt >= debounceMs) {
            postSafely(`[THiNX API] Redis client disconnected: ${reason}`);
            lastDownPostedAt = ts;
        }
        inOutage = true;
    }

    function handleReady() {
        console.log('ℹ️ [info] [redis-health] Redis client ready');
        if (inOutage) {
            postSafely('[THiNX API] Redis client reconnected, healthy');
            inOutage = false;
            // Reset so a *future* outage posts immediately rather than being
            // suppressed by the previous outage's debounce timestamp.
            lastDownPostedAt = 0;
        }
    }

    const onError = (err) => handleDisconnect('disconnected', err);
    const onEnd = () => handleDisconnect('ended', 'end event');
    const onReady = () => handleReady();

    if (client && typeof client.on === 'function') {
        client.on('error', onError);
        client.on('end', onEnd);
        client.on('ready', onReady);
    } else {
        console.log('☣️ [error] [redis-health] attach called with non-EventEmitter client; listeners not registered');
    }

    return {
        detach() {
            if (!client || typeof client.removeListener !== 'function') return;
            client.removeListener('error', onError);
            client.removeListener('end', onEnd);
            client.removeListener('ready', onReady);
        }
    };
}

module.exports = { attach };
