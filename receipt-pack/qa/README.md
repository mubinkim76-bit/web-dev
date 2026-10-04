# Browser QA

App runtime and Node tests require Node 20+ only. Browser QA additionally requires Python 3, Playwright, Pillow, PyMuPDF, a sandbox-enabled Chromium, and libzbar for QR decoding. Install these QA tools using your environment's supported package setup.

From this project folder, run `npm run build`, then `python3 qa/browser.py`. Set `NODE_BINARY` and `CHROMIUM_PATH` if their default locations differ. The script uses only synthetic fixtures, starts a loopback server, and creates results in `qa/browser-output/`. It does not publish the website. Do not disable browser sandboxing or bypass access restrictions.

Large screenshots and generated download artifacts are excluded from Git. Existing historical QA summaries are recorded in SPEC.json and validation.json. These are not a fresh run on a production URL. Physical mobile and physical print checks remain outstanding.

## Independent consumer regression

After building, run `python3 qa/consumer.py` with the same prerequisites and sandbox requirements above. It includes the baseline checks plus invalid files and amounts, image-count limits, cancellation during decoding and rerun, language-change confirmation, and a populated 320px layout. The decoding cancellation check delays `createImageBitmap` completion inside the test page to exercise pending work deterministically.

Results, synthetic CSV/PDF downloads and screenshots are written to `qa/consumer-output/`. These generated artifacts are not source files and should not be committed. A successful run reports seven groups; the three baseline groups are included, not additional.

The replacement regression verifies that malformed or undecodable images, mixed valid/invalid batches, and empty selection preserve confirmed receipts and dirty state; a fully valid replacement still resets the receipt fields.
