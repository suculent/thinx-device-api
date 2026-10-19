# Remove unused THiNX accounts

Run `scripts/purge-unused-users.js` from a checkout or API container with Node.js
and the project's dependencies installed. It defaults to a read-only scan.

```sh
node scripts/purge-unused-users.js --scan
```

Configure `COUCHDB_URL` (default `http://couchdb:5984`), `COUCHDB_USER` and
`COUCHDB_PASS` (or `COUCHDB_PASSWORD`). The API container's `/run/secrets/`
credentials work automatically and take precedence over environment credentials.
A credentialed `COUCHDB_URL` also works when separate credentials are absent.
Do not put passwords on the command line.

Set `THINX_PREFIX` to the deployment's database prefix; the default is empty.
The script prints its target database names at startup. Verify these before apply:
`<prefix>managed_users` and `<prefix>managed_devices`. It does not load the API
configuration or create databases, indexes or prefix files.

## Selection

A candidate must have a valid owner ID matching its document ID, a revision,
**neither `last_seen` nor `last_login` present**, and no device documents with
that owner in `managed_devices`. Device ownership comes from actual documents;
the admin API currently returns a placeholder zero device count for every user.

The script preserves:

- Any user with either login field, even if its value is null, empty or invalid.
- Administrators and documents with replication conflicts or ambiguous identities.
- User documents with attachments, whose binary data would not be captured by
  the JSON backup. Device replication conflicts abort the entire scan because
  a conflicting revision may have a different owner.
- OAuth-created users (`activation: false`) and users with `gitHubAccessToken`.
  First-time OAuth login can create an account without writing `last_seen`.

There is no account-age cutoff: a newly registered, unused account can qualify.
Missing login markers are the application's stored evidence, not proof that a
historical login never happened if its tracking write failed or data was lost.
Review candidates before applying. Each JSON output line contains an action and
owner ID, or a summary; emails, passwords and tokens are not printed.

## Apply during maintenance

Pause API login/registration and all device-creation or ownership-change writers
before scanning and applying. Keep them paused until the command finishes.
CouchDB cannot atomically check devices in one database and delete a user in
another; rechecks alone cannot close that race. The script does not stop services.

Choose a new backup filename on a persistent volume in a private directory:

```sh
node scripts/purge-unused-users.js --apply \
  --snapshot-to /mnt/data/private/unused-users-2026-10-19.jsonl
```

The directory must already exist. The script creates the file exclusively with
mode `0600`, saves all candidate user documents, and flushes the file and its
parent directory to disk before
deleting anything. It refuses existing files (including symlinks). The backup
contains password hashes and account secrets: keep it private, outside the Git
checkout, and retain it according to your backup policy. No backup is created
when there are no candidates.

Both database scans must finish successfully before any deletion. Immediately
before each deletion the script reloads the user, requires the original revision
and selection criteria, and checks for devices again. Changed accounts are
skipped. Revision conflicts are reported and never retried automatically.
Unknown read/write failures abort; earlier successful deletions remain applied
and are reported in the progress output and partial summary. A lost response to
a deletion can leave its outcome uncertain; inspect CouchDB and the backup
before retrying. Use a new backup filename for any subsequent apply.

Deletion uses CouchDB revision-checked `DELETE`, leaving replication tombstones.
It does not use the replication-sensitive `_purge` API. It removes only user
documents; it does not invoke the broader GDPR purger or remove Redis keys,
sessions, MQTT credentials, files, audit logs, or builds. Registration creates
default MQTT credentials even before first login, so this is not a full account
credential-revocation tool.

For recovery, use the saved original document contents and the current tombstone
revision to restore the document through CouchDB; replaying the saved `_rev`
directly will conflict. Review any subsequent account activity before restoration.

`--batch-size N` controls scan page size (default 500, maximum 10000). Scans are
paged; distinct device owners and candidate user documents are held in memory.
Exit codes: `0` completed, `1` runtime failure or concurrent changes requiring
review, `2` argument/connection configuration error. `--help` requires no services.

## Local verification

The Jasmine suite is picked up by the normal CI spec glob. To run only this suite
without the API/service bootstrap:

```sh
node -e 'const Jasmine = require("jasmine"); const runner = new Jasmine(); runner.loadConfig({spec_dir:"spec",spec_files:["jasmine/PurgeUnusedUsersSpec.js"],helpers:[],random:false}); runner.execute();'
```
