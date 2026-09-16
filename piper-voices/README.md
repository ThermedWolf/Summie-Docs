# Piper voices — bundled + on-demand

- **Bundled (ships with installer):** `en_US-libritts_r-medium` — English neural, ~45 MB. Place `en_US-libritts_r-medium.onnx` + `en_US-libritts_r-medium.onnx.json` in `en_US-libritts_r-medium/` before `npm run build`. CI can fetch from `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/`.
- **On-demand (downloaded to `userData/piper-voices/`):** `nl_NL-mls-medium` (female) + `nl_NL-ronnie-medium` (male). Downloaded via `piper-download-voice` IPC from the same Hugging Face base URL.

If the `*.onnx` files are absent, the app still builds — Piper status will report `installed:false` and the download flow will fetch them at runtime. English bundled is optional for dev; production builds should include it for offline English.

Fetch example:
```
curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx -o app/piper-voices/en_US-libritts_r-medium/en_US-libritts_r-medium.onnx
curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json -o app/piper-voices/en_US-libritts_r-medium/en_US-libritts_r-medium.onnx.json
```
