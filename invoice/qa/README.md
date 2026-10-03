# Browser QA

App runtime and Node tests require Node 20+ only. Browser QA additionally requires Python 3, Playwright, Pillow, PyMuPDF, a sandbox-enabled Chromium, and libzbar for QR decoding. Install these QA tools using your environment's supported package setup.

From this project folder, run `npm run build`, then `python3 qa/browser.py`. Set `NODE_BINARY` and `CHROMIUM_PATH` if their default locations differ. The script uses only synthetic fixtures, starts a loopback server, and creates results in `qa/browser-output/`. It does not publish the website. Do not disable browser sandboxing or bypass access restrictions.

Large screenshots and generated download artifacts are excluded from Git. Existing historical QA summaries are recorded in SPEC.json and validation.json. These are not a fresh run on a production URL. Physical mobile and physical print checks remain outstanding.

## Additional invoice boundary checks

Run `python3 qa/consumer.py` from the project folder after the checks above.
It starts and stops its own loopback server on a free port and writes
`qa/browser-output/consumer-browser.json`. It uses sandbox-enabled Chromium
and the same `NODE_BINARY` / `CHROMIUM_PATH` overrides as the baseline script.
The six groups cover decimal totals and escaped input, invalid input recovery,
language-change cancellation and confirmation, the 1–100 item boundary,
entry routes/local headers, and runtime request isolation. Only synthetic inputs
are used. Run both scripts: these checks supplement the baseline screenshots
and print-HTML PDF rendering. Native print-dialog interaction and physical
printing remain separate checks; no direct PDF download feature is added.
