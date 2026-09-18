#!/usr/bin/env node
/*
 * scripts/purge-orphaned-rsa-keys.js
 *
 * Deletes deploy-key material in app_config.ssh_keys (/mnt/data/ssh_keys)
 * belonging to owners that no longer have a document in `managed_users`.
 * Accounts deleted before revokeAllForOwner existed (GDPR #353) left their
 * private keys on disk indefinitely.
 *
 * Also reports stray askpass scripts. git.js writes `<key>.sh` next to a key
 * for the duration of one ssh-add and removes it again, so any that survive
 * are crash leftovers -- and they hold GIT_KEY_PASSPHRASE in plaintext.
 * (The legacy `askpass.sh` is one of these; nothing references it any more.)
 *
 * Modes:
 *   --scan    Dry-run (DEFAULT). Reports what would be deleted, touches nothing.
 *   --apply   DESTRUCTIVE. Unlinks the orphaned private + public keys.
 *
 * Flags:
 *   --askfiles  Include stray *.sh askpass leftovers in the purge.
 *   --json      Machine-readable output.
 *   --help, -h  Print usage and exit 0.
 *
 * Refuses to delete anything when the users view errors or comes back empty,
 * so a CouchDB outage cannot be mistaken for "nobody owns these keys".
 *
 * Usage (inside the API container):
 *   node scripts/purge-orphaned-rsa-keys.js
 *   node scripts/purge-orphaned-rsa-keys.js --apply --askfiles
 */

'use strict';

const fs = require('fs-extra');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ASKFILES = args.includes('--askfiles');
const JSON_OUT = args.includes('--json');

if (args.includes('--help') || args.includes('-h')) {
    console.log([
        'Usage: node scripts/purge-orphaned-rsa-keys.js [--scan|--apply] [--askfiles] [--json]',
        '',
        '  --scan       Dry-run (default). Reports orphans, deletes nothing.',
        '  --apply      DESTRUCTIVE. Deletes orphaned key pairs.',
        '  --askfiles   Also handle stray *.sh askpass leftovers (they contain',
        '               GIT_KEY_PASSPHRASE in plaintext).',
        '  --json       Machine-readable output.',
        '',
        'An owner is orphaned when no document with that _id exists in',
        'managed_users. The script aborts without deleting if the users view',
        'fails or returns no rows.'
    ].join('\n'));
    process.exit(0);
}

const RSAKey = require('../lib/thinx/rsakey.js');
const rsakey = new RSAKey();

// Stray askpass leftovers: `<key>.sh` written by git.js, plus legacy askpass.sh.
function strayAskfiles() {
    try {
        return fs.readdirSync(rsakey.ssh_keys).filter((f) => f.endsWith('.sh'));
    } catch {
        return [];
    }
}

const askfiles = strayAskfiles();

rsakey.purgeOrphanedKeys({ dry_run: !APPLY }, (success, result) => {

    if (!success) {
        console.error('[purge-orphaned-rsa-keys] aborted:', result);
        process.exit(1);
    }

    let removed_askfiles = [];
    if (ASKFILES && APPLY) {
        for (const file of askfiles) {
            fs.unlinkSync(rsakey.ssh_keys + '/' + file);
            removed_askfiles.push(file);
        }
    }

    const report = {
        mode: APPLY ? 'apply' : 'scan',
        ssh_keys: rsakey.ssh_keys,
        owners_in_db: result.owners_in_db,
        owners_on_disk: result.owners_on_disk,
        orphaned_owners: result.orphaned_owners,
        keys_affected: result.purged.reduce((sum, entry) => sum + entry.keys, 0),
        purged: result.purged,
        stray_askfiles: askfiles,
        removed_askfiles: removed_askfiles
    };

    if (JSON_OUT) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(0);
    }

    console.log('[purge-orphaned-rsa-keys] key dir       :', report.ssh_keys);
    console.log('[purge-orphaned-rsa-keys] owners in db  :', report.owners_in_db);
    console.log('[purge-orphaned-rsa-keys] owners on disk:', report.owners_on_disk);
    console.log('[purge-orphaned-rsa-keys] orphaned      :', report.orphaned_owners,
        '(' + report.keys_affected + ' key pairs)');
    for (const entry of report.purged) {
        console.log('  ' + (APPLY ? 'deleted' : 'would delete') + ' ' + entry.keys + ' key(s) for ' + entry.owner);
    }
    if (askfiles.length > 0) {
        console.log('[purge-orphaned-rsa-keys] stray askfiles:', askfiles.join(', '));
        if (!ASKFILES) console.log('  (pass --askfiles to remove them; they hold the passphrase in plaintext)');
        if (removed_askfiles.length > 0) console.log('  removed:', removed_askfiles.join(', '));
    }
    if (!APPLY) console.log('[purge-orphaned-rsa-keys] dry run — nothing was deleted. Re-run with --apply.');

    process.exit(0);
});
