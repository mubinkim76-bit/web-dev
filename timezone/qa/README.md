# Browser QA

App runtime and Node tests require Node 20+ only. Browser QA additionally requires Python 3, Playwright, Pillow, PyMuPDF, a sandbox-enabled Chromium, and libzbar for QR decoding. Install these QA tools using your environment's supported package setup.

From this project folder, run `npm run build`, then `python3 qa/browser.py`. Set `NODE_BINARY` and `CHROMIUM_PATH` if their default locations differ. The script uses only synthetic fixtures, starts a loopback server, and creates results in `qa/browser-output/`. It does not publish the website. Do not disable browser sandboxing or bypass access restrictions.

Large screenshots and generated download artifacts are excluded from Git. Existing historical QA summaries are recorded in SPEC.json and validation.json. These are not a fresh run on a production URL. Physical mobile and physical print checks remain outstanding.

Run `python3 qa/consumer-browser.py` after building for additional input, overlap, DST-choice, cancellation and language checks. Results use only synthetic inputs and are written to the Git-excluded `qa/consumer-browser-output/` directory. This script includes the three baseline groups.
