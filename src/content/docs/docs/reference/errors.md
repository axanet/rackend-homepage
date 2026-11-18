---
title: Errors
description: Every error response is an RFC 9457 problem details object. All problem codes and the formats protocols mandate.
sidebar:
  order: 1
---

Every error response from rackend is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details object with content type `application/problem+json`:

```json
{
  "type": "https://github.com/axanet/rackend/blob/main/docs/errors.md#validation_failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "urn:uuid:01936b2e-7c4a-7d1e-9f3a-2b8c1d4e5f60",
  "code": "validation_failed",
  "request_id": "01936b2e-7c4a-7d1e-9f3a-2b8c1d4e5f60"
}
```

:::note
rackend 0.0.x links `type` to a page in the rackend repository, which forwards each code to this page. Later versions link here directly (`https://rackend.axanet.ch/docs/reference/errors/#<code>`).
:::

| Member | Meaning |
|---|---|
| `type` | Permanent URI of the problem type, ending in `#<code>`. |
| `title` | Short summary. Constant per type. |
| `status` | The HTTP status of the response. |
| `detail` | Explanation of this occurrence. Never contains internal details. May be absent. |
| `instance` | `urn:uuid:<request_id>`. |
| `code` | Stable machine-readable identifier. **Clients should rely on this**; `title` and `detail` text may change between versions. |
| `request_id` | Same value as the `X-Request-Id` response header. Quote it when reporting a problem. |

Extension members that appear only when they apply: `errors` (field-level validation errors keyed by field name), `position` (`{line, column, offset}` of a rule/filter error), `retry_after_s` (429/503), `max_bytes` (413) and `allowed` (405).

Exceptions, where a standard defines its own format, are described under [Protocol-mandated formats](#protocol-mandated-formats).

## Problem types

### bad_request

- **Status:** 400
- **Title:** Bad request
- **When:** the request is malformed: invalid JSON, a bad query parameter, bad multipart data, or a request the server could not interpret. `detail` describes what was wrong with the input.

### validation_failed

- **Status:** 400
- **Title:** Validation failed
- **When:** the body is well-formed but one or more fields are invalid.
- **Extensions:** `errors`: `{ "<field>": [{ "code", "message", "params" }] }`. Nested paths use dot notation (`expand.author`, `@json.title`).

### rule_compile_error

- **Status:** 400
- **Title:** Invalid rule or filter expression
- **When:** a `filter` parameter or an access rule does not compile.
- **Extensions:** `position`: `{ "line", "column", "offset" }`.

### unauthorized

- **Status:** 401
- **Title:** Unauthorized
- **When:** credentials are missing, invalid or expired. The response carries `WWW-Authenticate: Bearer realm="rackend"`, with `error="invalid_token"` where relevant (RFC 6750).

### forbidden

- **Status:** 403
- **Title:** Forbidden
- **When:** the caller is authenticated but not allowed: an access rule denies the operation, a CSRF/origin check failed, or a superuser is required.

### not_found

- **Status:** 404
- **Title:** Not found
- **When:** unknown route, collection or record, or a record the caller may not view (rackend does not reveal whether it exists).

### method_not_allowed

- **Status:** 405
- **Title:** Method not allowed
- **When:** the route exists but not for this method.
- **Extensions:** `allowed`: the allowed methods. The `Allow` header is set too.

### not_acceptable

- **Status:** 406
- **Title:** Not acceptable
- **When:** the server cannot produce a representation matching the `Accept` header.

### request_timeout

- **Status:** 408
- **Title:** Request timeout
- **When:** the client did not send the request (headers or body) within the server's time limit.

### conflict

- **Status:** 409
- **Title:** Conflict
- **When:** the request conflicts with the current state: a unique constraint, a concurrent schema change, or a relation with `on_delete: restrict`.

### precondition_failed

- **Status:** 412
- **Title:** Precondition failed
- **When:** an `If-Match` header does not match the current version of the record.

### payload_too_large

- **Status:** 413
- **Title:** Payload too large
- **When:** the body or an uploaded file exceeds its limit.
- **Extensions:** `max_bytes`: the limit that was exceeded.

### unsupported_media_type

- **Status:** 415
- **Title:** Unsupported media type
- **When:** wrong `Content-Type`, or an uploaded file type is not allowed for the field.
- **Extensions:** `errors` (per field, code `type_not_allowed` with the detected `type` and the `allowed` list) when an upload was refused.

### range_not_satisfiable

- **Status:** 416
- **Title:** Range not satisfiable
- **When:** a file download asked for a `Range` outside the file.
- **Extensions:** `size` (the file size). The `Content-Range: bytes */<size>` header is set too.

### rate_limited

- **Status:** 429
- **Title:** Too many requests
- **When:** a rate limit was exceeded, or an IP has too many realtime connections open (`realtime.max_connections_per_ip`).
- **Extensions:** `retry_after_s`. The `Retry-After` header is set too.

### smtp_not_configured

- **Status:** 409
- **Title:** SMTP is not configured
- **When:** the action sends email and SMTP is not set up in the settings.

### public_url_not_configured

- **Status:** 409
- **Title:** Public URL is not configured
- **When:** the action needs `app.public_url` (OIDC, external providers, passkeys, email links) and it is not set yet.

### internal

- **Status:** 500
- **Title:** Internal server error
- **When:** an unexpected error. `detail` is generic. The full error is logged on the server with the `request_id`; quote it when reporting the problem.

### query_timeout

- **Status:** 503
- **Title:** Query timeout
- **When:** a query produced by a rule or filter exceeded the time limit (`limits.rule_timeout_ms`). Simplify the filter or add an index.

### unavailable

- **Status:** 503
- **Title:** Service unavailable
- **When:** the server cannot serve the request right now: the write queue is full, migrations are running, or the server is shutting down.
- **Extensions:** `retry_after_s`. The `Retry-After` header is set too.

## Protocol-mandated formats

- **OAuth 2.0 / OIDC token, revocation and userinfo endpoints:** the body has `error` and `error_description` as RFC 6749 §5.2 / RFC 6750 require, plus the RFC 9457 members above. Content type stays `application/json`.
- **Authorization endpoint:** once a valid redirect URI is known, errors are returned as redirect query parameters (`error`, `error_description`, `state`). Before that, an error page is shown.
- **Hosted HTML pages** (`/auth/*`, the `/_/` admin UI shell): browsers get a human-readable HTML page showing title, detail and request id. Send `Accept: application/json` or `application/problem+json` to get the problem object instead.
- **External sign-in callback** (`/api/collections/{c}/providers/{name}/callback`): the browser returns to the app at `redirect_uri#error=<code>`. Codes: `invalid_state` (the sign-in took too long, was started in another browser, or `state` did not match), `access_denied` (the user declined at the provider), `provider_error` (the provider refused the code or the ID token did not validate), `account_not_found` (no linked account and sign-up is off), `email_in_use` (an account with this email exists; sign in and link the provider), `identity_in_use` (the provider account is linked to another user), `server_error`. Without a valid state cookie there is no safe place to return to, and an error page is shown.
- **Email link pages** (`/auth/verify`, `/auth/reset`, `/auth/email-change`): always HTML. An invalid or used link shows "This link does not work" with status 400.
- **WebSocket:** after the upgrade, errors are `{"t":"err","id":<n>,"code":"<problem code>","message":"…"}` messages (`errors` added for validation problems). The server closes with code 4000 and the reason (`session_revoked`, `slow_consumer`, `shutdown`, `timeout`). See the [realtime protocol](/docs/reference/realtime-protocol/).
- **Server-sent events:** problems before the stream opens are normal problem responses. After that, the stream ends with `event: close` and `{"type":"close","reason":"…"}`. See the [realtime protocol](/docs/reference/realtime-protocol/).
