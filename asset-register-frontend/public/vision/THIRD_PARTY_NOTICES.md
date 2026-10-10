# On-device photo recognition notices

- `wasm/vision_wasm_internal.js` and `wasm/vision_wasm_internal.wasm` come from `@mediapipe/tasks-vision` 1.1.0. MediaPipe is licensed under Apache-2.0; see `LICENSE-MediaPipe.txt` and the package's upstream source at https://github.com/google-ai-edge/mediapipe.
- `efficientnet_lite0_int8_v1.tflite` is Google's EfficientNet-Lite0 int8 image-classification model, version 1, served from https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite. The model metadata declares Apache-2.0; the upstream model implementation license is included in `LICENSE-EfficientNet-Lite0.txt`.
- The model is trained on ImageNet's 1,000 general image classes. It suggests common office-item types when a supported label and confidence threshold match; it is not a model trained on Incuspaze's own inventory. Specialized equipment such as a particular router or switch still needs a readable product label or a close match to a registered photo.

Photos are classified in the browser on the user's device. The model and runtime are downloaded from this application's own origin after the user chooses to prepare photo suggestions. The service worker caches those files so later photo classification can run offline.
