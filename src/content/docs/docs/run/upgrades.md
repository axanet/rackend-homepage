---
title: Upgrades
description: What rackend does before every schema change, and how to go back to an older version.
sidebar:
  order: 9
---

Upgrading never loses data. Pin the minor version of the image (`ghcr.io/axanet/rackend:0.0`) and change it on purpose; the [changelog](https://github.com/axanet/rackend/blob/main/CHANGELOG.md) lists what each release changes. On start, before any schema change, rackend:

1. refuses to run against a database written by a newer version (exit 78), because downgrades are not supported;
2. checks there is enough free space (2 × database size + 100 MB, else exit 73);
3. writes a verified snapshot to `backups/pre-upgrade-<from>-to-<to>-<timestamp>.db` (exit 74 if verification fails);
4. applies each migration in its own transaction (exit 70 on failure, data unchanged) and checks integrity afterwards.

The last 5 pre-upgrade backups are kept.

## Going back

To go back to an older version, stop rackend, replace `data.db` with the matching pre-upgrade backup, remove `data.db-wal` and `data.db-shm`, and start the older version.

## Migration status

`rackend migrate status` shows applied and pending migrations without changing anything; it is safe to run next to a live instance.
