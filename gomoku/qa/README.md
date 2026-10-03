# Browser QA

App runtime and Node tests require Node 20+ only. Browser QA additionally requires Python 3, Playwright, Pillow, PyMuPDF, a sandbox-enabled Chromium, and libzbar for QR decoding. Install these QA tools using your environment's supported package setup.

From this project folder, run `npm run build`, then `python3 qa/browser.py`. Set `NODE_BINARY` and `CHROMIUM_PATH` if their default locations differ. The script uses only synthetic fixtures, starts a loopback server, and creates results in `qa/browser-output/`. It does not publish the website. Do not disable browser sandboxing or bypass access restrictions.

Large screenshots and generated download artifacts are excluded from Git. Existing historical QA summaries are recorded in SPEC.json and validation.json. These are not a fresh run on a production URL. Physical mobile and physical print checks remain outstanding.

## Additional boundary checks

After `npm run build`, run:

```sh
python3 qa/consumer_http.py
python3 qa/consumer_browser.py
```

The HTTP checks use Python standard libraries and start both source and dist servers. The boundary browser script requires Python Playwright and sandbox-enabled Chromium. It covers win/replay, duplicate and post-win input, undo/restart cancellation, mode navigation, AI/hint cancellation, a deliberately aborted Worker request followed by retry, saved-game recovery/deletion, language-switch confirmation, and Korean/English gameplay/zoom at 1440, 390 and 320 pixels. There is no game-record download feature.

Generated results and screenshots are under `qa/consumer-output/` and ignored by Git. Keep browser sandboxing enabled and use your environment's supported execution/approval mechanism if restricted execution cannot launch Chromium. Do not change sandbox ownership, permissions or security settings to make a check pass.
