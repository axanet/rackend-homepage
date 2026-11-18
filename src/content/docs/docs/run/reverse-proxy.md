---
title: Behind a reverse proxy
description: Client IPs, realtime connections, the paths to forward and CORS when rackend runs behind a reverse proxy.
sidebar:
  order: 3
---

## Client IPs

Rate limits and audit entries use the client IP. Without trusted proxies that is the address of the TCP connection, which behind a proxy is the proxy itself. Set `RACKEND_TRUSTED_PROXIES` (or `security.trusted_proxies` in the settings) to the proxy's address or network; rackend then takes the right-most address in `X-Forwarded-For` that is not a trusted proxy.

:::caution
Never trust a network that clients can send from directly, or they can choose their own IP.
:::

## Realtime

Realtime uses long-lived connections. The proxy must pass WebSocket upgrades on `/api/ws` and must not buffer `GET /api/realtime` (Server-Sent Events; rackend sends `X-Accel-Buffering: no` for nginx). Set read timeouts above 60 seconds: rackend sends a heartbeat every 25 seconds. Example for nginx:

```nginx
location /api/ws {
    proxy_pass http://rackend:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
}
location / {
    proxy_pass http://rackend:8080;
    proxy_http_version 1.1;
    proxy_read_timeout 120s;
}
```

Each realtime connection holds a file descriptor. For many clients raise the limit (`docker run --ulimit nofile=65536:65536 ...`).

## Paths to forward

Forwarding everything to rackend is simplest. If your proxy only forwards some paths:

- `/api/` for the API, realtime and files;
- `/_/` for the admin UI;
- `/auth/` for the pages that links in emails open (`/auth/verify`, `/auth/reset`, `/auth/email-change`) and for the hosted sign-in pages;
- `/.well-known/` and `/oauth2/` when apps [sign in through rackend](/docs/guides/sign-in-for-apps/).

## CORS

Browsers on other origins need CORS for `/api`: list your apps' origins in `security.cors_origins`. The OpenID Connect endpoints allow any origin.
