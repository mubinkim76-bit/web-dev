# Static deployment

Node 20+ is required. No dependency installation is needed.

```sh
npm test
npm run lint
npm run build
npm run preview
```

Publish only `dist/`, which contains the HTML entry, local modules/styles/font, favicon, headers and license notices. Serve this app at the origin root: the entry is `/` or `/index.html`, and English is selected with `/?lang=en`. Root-absolute asset paths do not support arbitrary subdirectory hosting. No SPA rewrite is needed.

The `_headers` file declares content security, frame/MIME protection, referrer suppression and `Cache-Control: no-cache`. HTML and module filenames are not fingerprinted, so caches must revalidate. The local preview server uses `no-store` and does not interpret `_headers`; verify actual response headers, Worker loading and cache revalidation on the selected host after deployment.

Gomoku supports local two-player and bounded local AI, optional single-game browser storage, undo and hints. Game-record export/download is not implemented. Accounts, payments, advertising, server telemetry, operational databases and online multiplayer are not connected.

Keep `LICENSE.md`, `THIRD_PARTY_NOTICES.md` and the font license in the deployment package. No new open-source license is granted to the application source.

## Verification

See `qa/README.md` for repeatable HTTP and sandbox-enabled Chromium tests. Automated Chromium checks cover desktop and narrow Korean/English layouts, real AI Workers, failure/retry, cancellation, local storage and language switching. Physical devices, other browser engines, and production CDN/TLS/header/cache behavior require separate validation. Build success alone does not establish deployment readiness.
