# OCR asset notices

- `worker.min.js` is from Tesseract.js 7.0.0 and is licensed under Apache-2.0; see `LICENSE-tesseract.js.md`.
- `core/tesseract-core-lstm.wasm.js` is from Tesseract.js Core 7.0.0 and is licensed under Apache-2.0; see `LICENSE-tesseract.js-core.txt`.
- `lang/eng.traineddata.gz` is the `4.0.0_best_int` English model from `@tesseract.js-data/eng` 1.0.0. Its package metadata declares the MIT license.

These files are served from this application so OCR can work after the app is installed, including when a centre is offline. Product and invoice images are processed in the browser and are not sent to an OCR provider.
