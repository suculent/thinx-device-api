# Coding Conventions
> Last updated: 2026-05-18 | Focus: quality | Mapper: gsd-codebase-mapper

## Summary
This is a Node.js IoT backend written in CommonJS (not ESM). Modules are ES6 classes exported via `module.exports = class`. The ESLint config is deliberately permissive — indentation, semicolons, quotes, and camelCase are all disabled — so formatting is freeform and inconsistent across files. The one enforced rule is `no-unused-vars` (with `^_` prefix escape).

---

## Naming Patterns

**Files:**
- Router files use dot-separated names: `router.device.js`, `router.apikey.js`, `router.auth.js` — all in `lib/`
- Domain modules use plain lowercase names: `lib/thinx/device.js`, `lib/thinx/owner.js`, `lib/thinx/apikey.js`
- Spec files follow `[Name]Spec.js` convention: `DeviceSpec.js`, `ApikeySpec.js`, `SanitkaSpec.js`
- Router integration specs use a `ZZ-` prefix to force execution order: `ZZ-RouterDeviceAPISpec.js`, `ZZ-RouterBuilderSpec.js`

**Classes (PascalCase):**
- All domain modules export a single class: `Device`, `APIKey`, `Auth`, `Sanitka`, `Util`, `Validator`, `JWTLogin`, `InfluxConnector`, `Buildlog`, `Deployment`
- File name does not always match class name exactly: `apikey.js` → `APIKey`, `files.js` → `Filez`, `jwtlogin.js` → `JWTLogin`

**Functions (mixed styles — no enforced convention):**
- Instance methods use snake_case in some modules: `save_apikeys`, `update_binary`, `update_multiple`, `create_key`
- Static utility methods use camelCase: `Sanitka.branch()`, `Sanitka.udid()`, `Util.ownerFromRequest()`, `Util.validateSession()`
- Many classes expose both a static and instance version of the same method (see `Sanitka`)

**Variables:**
- `let` and `var` are both used — no consistent preference
- Redis clients often named `redis_base` then `.legacy()` assigned to `redis`
- Short names like `ak`, `thx`, `envi`, `udid`, `oid` are common in spec fixtures

---

## Code Style

**Formatting:**
- No Prettier configured
- ESLint (`eslint.config.js` and `.eslintrc.js`) extends `eslint:recommended` but disables nearly all style rules:
  - `indent: 0` — any indentation allowed
  - `semi: 0` — semicolons optional
  - `quotes: 0` — single or double quotes, mixed
  - `max-len: 0` — no line length limit
  - `camelcase: 0` — snake_case or camelCase both allowed

**Only enforced ESLint rule:**
```js
"no-unused-vars": ["error", {
  "argsIgnorePattern": "^_",
  "varsIgnorePattern": "^_",
  "caughtErrorsIgnorePattern": "^_"
}]
```
Unused variables beginning with `_` are permitted; all others cause an error.

**Module system:**
- `sourceType: "script"` — CommonJS only, no ES module imports
- All requires use `require()`, no `import/export`

**ESLint ignores (from `eslint.config.js`):**
- `node_modules/**`
- `**/*.min.js`
- `services/console/**`, `services/broker/**`, `services/transformer/**`, `services/worker/**`
- `spec/test_repositories/**`

---

## Import Organization

No enforced import order. Observed pattern in domain modules:

1. Internal Globals/config first: `require("./globals.js")`
2. Node built-ins: `require('fs-extra')`, `require('crypto')`
3. Third-party packages: `require('nano')`, `require('sha256')`, `require('uuid')`
4. Sibling domain modules: `require('./sanitka')`, `require('./audit')`, `require('./apikey')`

Example from `lib/thinx/device.js`:
```js
let Globals = require("./globals.js");
let fs = require("fs-extra");
let http = require('http');
let md5 = require('md5');
const Database = require("./database.js");
const Auth = require('./auth');
const Audit = require('./audit');
```

---

## Error Handling

**Callback convention (primary pattern):**
All async domain operations use Node-style callbacks, but with a custom signature: `callback(success: boolean, result_or_error_string)` rather than the standard `(err, result)`:
```js
// lib/thinx/apikey.js
callback(false, "apikey_not_found");
callback(true, api_key_array);

// lib/thinx/owner.js
return callback(false, "undefined_owner");
return callback(false, "profile_update_failed");
```

**Try/catch:**
Used for JSON parsing and file I/O, usually without re-throwing:
```js
try {
  buffer = fs.readFileSync(path);
} catch (e) {
  // swallowed or logged
}
```

**Guard clauses (preferred pattern):**
Early-return guards are common before async operations:
```js
if ((typeof(redis) === "undefined") || (redis === null)) {
  throw new Error("Auth requires connected Redis client.");
}
if (typeof(owner) === "undefined") return callback(false);
```

**Express route errors:**
Returned as JSON objects via `Util.responder(res, false, "error_key_string")`, not thrown:
```js
// lib/thinx/util.js
Util.responder(res, false, "missing_mac");
res.status(403).end();
```

---

## Logging

**Two parallel logging systems exist simultaneously:**

1. **`console.log` (dominant)** — used throughout `lib/thinx/*.js` and router files. Not going away.

2. **Winston logger (`lib/thinx/logger.js`)** — used only in `lib/thinx/statistics.js`. Provides two transports:
   - Console: all levels, colorized in `development` env
   - File: `warn`+ only, written to `{DATA_ROOT}/statistics/latest.log`

**Emoji-prefixed severity convention (console.log only):**
All severity-indicating `console.log` calls in domain code follow an emoji + bracket tag pattern:
```js
console.log("🚫  [critical] update path must be defined");
console.log("☣️ [error] Upload callback failed: " + e);
console.log("⚠️ [warning] Multi-file update for " + platform + " not yet fully supported.");
console.log("ℹ️ [info] Sending firmware update (" + buffer.length + ")");
console.log(`🚸 [chai] >>> running Device spec`);  // test-only
```

**Audit log events:**
Domain operations that affect user data call `Audit.log(owner_id, message, level, callback)`. This writes to CouchDB `managed_logs` database, not to stdout.

**Stats event format:**
Statistics parsing (`lib/thinx/statistics.js`) reads lines matching `[OID:xxx] [EVENT_NAME]` from the winston file log. These must be logged at `logger.warn()` because the parser skips lines containing `[info]`.

---

## Comments

**Module-level doc comment (JSDoc-style header):**
```js
/** This THiNX Device Management API module is responsible for managing devices. */
```
Present on most `lib/thinx/*.js` files as a single-line JSDoc above the class.

**Inline comments:**
Used to explain non-obvious decisions or legacy compatibility:
```js
// deepcode ignore HttpToHttps: support legacy devices in Device API
// deepcode ignore InsecureHash: required
// FIXME: Change to 401 Unauthorized in tests as well!
// TODO: From HTTP transformer communication to some kind of secure comms
```

**Snyk/security scanner suppression comments:**
`// deepcode ignore <rule>: <reason>` is used in 5+ places in lib code.

**Method-level JSDoc:**
Only used in `lib/thinx/apikey.js`:
```js
/**
 * Create new API Key for owner
 * @param {string} owner_id - owner_id
 * @param {string} apikey_alias - requested API key alias
 * @param {function} callback (err, apikey)
 */
```
Not consistently applied across other modules.

---

## Common Patterns

**Class instantiation with Redis dependency injection:**
All stateful modules require a connected Redis client passed to the constructor:
```js
// lib/thinx/device.js
constructor(redis) {
  if (typeof(redis) === "undefined") throw new Error("Device now requires connected redis.");
  this.redis = redis;
  this.auth = new Auth(redis);
  this.owner = new Owner(redis);
  this.apikey = new ApiKey(redis);
}
```

**Input sanitization via `Sanitka`:**
All user-supplied strings (owner IDs, UDIDs, API keys, URLs, branch names, usernames) pass through `lib/thinx/sanitka.js` before use. Sanitka returns `null` on invalid input; callers check for null before proceeding.

**Static + instance method duality in Sanitka:**
```js
static branch(input) { ... }
branch(input) { return Sanitka.branch(input); }
```
Allows both `sanitka.branch(x)` and `Sanitka.branch(x)` call sites.

**Globals singleton:**
`lib/thinx/globals.js` is a module-level IIFE that caches app config, Redis options, and Rollbar. Accessed everywhere as `Globals.app_config()`, `Globals.prefix()`, `Globals.redis_options()`.

**Commit convention (commitlint):**
Enforced via `commitlint.config.js` (conventional commits). Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`, `audit`. Subject case is not enforced. A `prepare-commit-msg` git hook at `.githooks/prepare-commit-msg` runs `scripts/normalize-commit-msg.js` to normalize commit messages before commit.

---

## Anti-Patterns Observed

- Mixed use of `var`, `let`, `const` — no enforcement
- `console.log` left in production code paths (not gated by debug flag consistently)
- `[DEBUG]` prefixed logs in `lib/thinx/apikey.js` appear to be development artifacts left in production code
- Some callbacks have `(success, result)` signature while others have `(err, result)` — inconsistency creates confusion when reading call sites
