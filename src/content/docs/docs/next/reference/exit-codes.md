---
title: Exit codes
description: What each exit code of rackend means.
sidebar:
  order: 3
---

| Code | Meaning |
|---|---|
| 0 | Normal shutdown |
| 1 | Invalid configuration or other startup failure |
| 70 | Migration or integrity failure |
| 73 | Not enough disk space for a safe upgrade |
| 74 | Pre-upgrade backup verification failed |
| 75 | Data directory locked by another instance |
| 78 | Database schema newer than this binary, or a migration checksum mismatch |

Codes 70 to 78 come from the safety checks before an [upgrade](/docs/run/upgrades/) and the [data directory lock](/docs/run/docker/#data-directory).
