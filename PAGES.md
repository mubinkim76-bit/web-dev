# Eleven services on one Cloudflare Pages site

Use Node 20+ at the repository root. No npm installation, server API or Pages Function is required.

- Build command: `node scripts/build-pages.mjs`
- Build output directory: `dist`
- Repository root directory: leave empty (repository root)
- Select the reviewed release branch/commit in the deployment system.

The root `/` lists all services. Their canonical entries are:

`/image-batch/`, `/photo-report/`, `/text-tools/`, `/invoice/`, `/csv-tools/`, `/receipt-pack/`, `/diff-tools/`, `/qr-tools/`, `/timezone/`, `/quantity/`, `/gomoku/`.

Append `?lang=en` for English. Slashless service URLs and `/index.html` aliases redirect to canonical entries. Query strings must survive these redirects. Unknown paths use the root `404.html` and must return HTTP 404, not the directory page or an app shell. No wildcard SPA rewrite is configured.

The build runs each existing independent build, copies its output under its slug, and scopes root-absolute `/src/` and `/public/` URLs only in generated HTML and CSS. Original service sources and independent `dist/` outputs retain origin-root behavior. JavaScript imports, Worker URLs based on `import.meta.url`, and bundled vendor/license files are copied byte-for-byte. This is a separate deployment layout; each service can still run and build alone.

One root `_headers` combines the identical service policies; the build fails if policies diverge. It retains CSP, frame/MIME protection, referrer suppression and `Cache-Control: no-cache` because filenames are not fingerprinted. Per-service `_headers` files are not copied as public assets. Upload only root `dist/`; it excludes tests, manifests, run scripts and browser evidence.

These services share an origin, which is not a security boundary between services. Only Gomoku accesses persistent browser storage (`game11.current.v1` and `game11.settings.v1`); the other ten services do not write localStorage/sessionStorage. The shared-origin regression preserves an opt-in saved Gomoku board through all service entries and restores it afterward. Two-tab conflict checks also run on the `/gomoku/` entry. This does not provide isolation from future same-origin applications: new storage users must use distinct keys and be reviewed.

## Local verification

```sh
python3 scripts/check-all.py
node scripts/build-pages.mjs
node --check scripts/build-pages.mjs
node --check scripts/serve-pages.mjs
node --test tests/pages.test.mjs
python3 qa/pages-browser.py
python3 scripts/publication-manifest.py --check
```

Browser prerequisites are in each service's `qa/README.md`. Keep Chromium sandboxing enabled. `pages-browser.py` starts a loopback static preview, verifies directory links, redirects, fonts, 404 and same-origin storage, then runs every service browser suite against its actual subpath. `QA_BASE_URL` lets those same tests target a loopback deployment path; omit it for their original standalone execution. Use a clean synthetic QA context, not a user's browser profile. Results are written to ignored QA output folders.

`node scripts/serve-pages.mjs` previews the combined build at `http://127.0.0.1:4173`; `PORT` overrides the port. It interprets this build's explicit redirects and global headers for testing. It is not a Cloudflare emulator and is not a production server. Before release, verify real Pages redirects/query retention, status codes, CSP, Worker requests, MIME types, cache revalidation and TLS at the deployed URLs. No deployment is performed by any build or QA command.

Cloudflare's documented behavior: [serving and 404 handling](https://developers.cloudflare.com/pages/configuration/serving-pages/), [redirect rules](https://developers.cloudflare.com/pages/configuration/redirects/), [response headers](https://developers.cloudflare.com/pages/configuration/headers/). Production CDN behavior, physical devices, native print dialogs/paper and other browser engines require separate verification.

## State-fix candidate verification

The state-fix candidate preserves the same eleven deployment paths and build command. Its runtime changes cover image settings-only edits and last-file removal guards; latest-request-only photo caption imports and complete report clearing; CSV replacement reads versus merge/stale-error handling; and preserving confirmed receipts when a replacement batch fails validation.

Run the full commands above on the candidate commit. The standalone and subpath browser gates automatically include `image-batch/qa/settings-dirty.py` and `csv-tools/qa/state-browser.py`. Without `QA_BASE_URL` these run against the standalone build; the combined runner sets that variable to the actual service subpath. Do not use `--expect-bug`, `--expect-removal-bug` or `--expect-race` in a release gate: they are baseline reproduction modes only. Image settings tests require no separate Pages build when run standalone.

The receipt and timezone consumer suites each repeat three baseline browser groups. Report those six repeated groups explicitly, and keep additional image settings/removal cases and CSV race checks separate from the existing group count. Historical `SPEC.json`, `validation.json` and manifest test counters describe earlier runs and are not proof of this candidate's results. Deployment handoff requires the tested candidate SHA, fresh gate logs and matching publication hashes; the build commands do not deploy anything.
