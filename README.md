# Eleven independent browser utilities

Version 0.2.3-independent.1. Each folder is an independent static web project with its own entry, local dependencies, source, tests and licenses. No sibling folder is needed. Korean and English are supported.

| Folder | Application |
| --- | --- |
| image-batch | Image batch conversion |
| photo-report | Photo PDF reports |
| text-tools | Unicode text tools |
| invoice | Invoice generation |
| csv-tools | CSV cleaning and export |
| receipt-pack | Manual receipt records |
| diff-tools | Text and CSV comparison |
| qr-tools | QR PNG/SVG generation |
| timezone | Timezone and DST conversion |
| quantity | Quantity calculation |
| gomoku | Gomoku game |

## Run one project

Node 20+ is required. No npm install is needed.

```sh
cd image-batch
npm start
```

Open http://127.0.0.1:4173. Replace image-batch with any folder above. Use different PORT values when running multiple projects. Serve through HTTP rather than opening index.html directly.

```sh
npm test
npm run lint
npm run build
npm run preview
```

The build produces each project's dist/. Publish only that generated dist/ to a static host. This repository publication is not website hosting deployment.

## Validation

The original source release recorded 149 Node test cases and 37 Chromium QA groups, including 66 Korean/English screenshots at 1440, 390 and 320 pixels. These historical totals predate the additional regression tests in this repository. Actual QA covers downloads, PDF/print-rendered output, cancellation, reruns, simultaneous imports and two-tab game storage conflicts where applicable. Historical summaries are in each SPEC.json; large outputs and internal work records are excluded. Browser scripts and prerequisites are described in each qa/README.md.

For a fresh full repository gate, provision the browser prerequisites documented in each `qa/README.md`, then run `python3 scripts/check-all.py`. The command stops on any Node, syntax, build or browser failure and keeps generated evidence in Git-ignored QA output folders.

Physical devices, native print dialogs, physical paper, other browser engines and production CDN checks remain outstanding. Node DOM tests alone do not certify actual browser behavior.

Apps process inputs locally and do not require accounts or payments. No server metrics, OCR service, Google login, payment or advertising integration is configured. See each service SPEC.json for supported limits. Host access-log handling depends on the selected host.

## Source and licenses

PROJECTS.json and each PROJECT-MANIFEST.json describe independent source entries and hashes. PUBLICATION-MANIFEST.json lists all intended public files except itself. Read each LICENSE.md, THIRD_PARTY_NOTICES.md and bundled vendor/font license text. This publication does not grant a new license to the application source; original rights are preserved.

## Verify publication hashes

Run `python3 scripts/publication-manifest.py --check` to verify the current public inventory. After an authorized source edit, run `python3 scripts/publication-manifest.py` to regenerate it. Source digests exclude QA and generated metadata; `PUBLICATION-MANIFEST.json` includes public source, tests, documentation and manifests, but excludes itself and Git-ignored build/QA outputs. Stage intended files before verification so Git ignore rules and the inventory remain explicit.

## One site with eleven service paths

Run `node scripts/build-pages.mjs` from the repository root to create a combined `dist/` with a service directory and eleven `/<slug>/` entries. Existing per-service builds remain available. See [PAGES.md](PAGES.md) for build settings, path normalization, headers, shared-origin storage and the full subpath QA gate. This prepares static files; it does not deploy them.
