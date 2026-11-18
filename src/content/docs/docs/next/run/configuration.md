---
title: Configuration
description: The bootstrap environment variables and how rackend keeps secrets encrypted at rest.
sidebar:
  order: 2
---

Almost everything is configured at runtime in the admin UI (Settings) or with `PATCH /api/settings`. Only a few bootstrap variables are read from the environment.

## Bootstrap environment variables

| Variable | Default | Meaning |
|---|---|---|
| `RACKEND_DATA_DIR` | `/data` (Docker) / `./rackend_data` | Data directory |
| `RACKEND_HTTP_ADDR` | `0.0.0.0:8080` | Listen address |
| `RACKEND_DEV` | `false` | Dev mode: pretty logs, permissive localhost handling. Never in production. |
| `RACKEND_LOG_LEVEL` | `info` | `tracing` filter, e.g. `info,rackend_store_sqlite=debug` |
| `RACKEND_LOG_FORMAT` | `json` (`pretty` in dev) | `json` or `pretty` |
| `RACKEND_SQLITE_SYNCHRONOUS` | `FULL` | `NORMAL` trades durability of the last commits on power loss for write speed (never corruption) |
| `RACKEND_PUBLIC_URL` | unset | Overrides the public URL stored in the settings |
| `RACKEND_SUPERUSER_EMAIL` / `RACKEND_SUPERUSER_PASSWORD` | unset | Create the first superuser without the setup screen (automation) |
| `RACKEND_ENCRYPTION_KEY` | unset | 32 bytes in base64 (`openssl rand -base64 32`). Encrypts secrets at rest; see below |
| `RACKEND_RESET_SECRETS` | `false` | Start even though the stored secrets cannot be decrypted, discarding them; see below |
| `RACKEND_TRUSTED_PROXIES` | unset | Comma-separated IPs or CIDRs (`10.0.0.0/8, ::1`) whose `X-Forwarded-For` is trusted. Overrides `security.trusted_proxies` |
| `RACKEND_OTLP_ENDPOINT` | unset | OpenTelemetry collector base URL (`http://otel-collector:4318`): traces and metrics are exported over OTLP/HTTP |

## Secrets at rest

SMTP and S3 passwords, client secrets of external providers and the signing keys are encrypted in the database. The key comes from `RACKEND_ENCRYPTION_KEY`, or, when it is not set, from a key rackend generates and stores in the database. The stored key only protects backups that you keep apart from the database, so set `RACKEND_ENCRYPTION_KEY` in production.

- **Adding the key later:** set `RACKEND_ENCRYPTION_KEY` and restart. rackend re-encrypts every secret with it and deletes the stored key (audited as `secrets.rekey`).
- **Keep the key safe.** Without it the secrets cannot be read and rackend refuses to start. Your collections and records are not affected.
- **Lost the key:** start once with `RACKEND_RESET_SECRETS=true` and a new key. rackend discards the secrets (audited as `secrets.reset`) and generates new signing keys; enter the SMTP, S3 and provider secrets again, then remove `RACKEND_RESET_SECRETS`.
