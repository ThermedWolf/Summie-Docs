# AI Models Directory

Bundled local-AI assets for Summie's spelling and language features.

## Structure
```
ai-models/
  hunspell/                  # Hunspell morphology dictionaries (correctness engine)
    nl.aff / nl.dic          # Dutch — Stichting OpenTaal (BSD-3-Clause / CC-BY-3.0, see LICENSE-opentaal.txt)
    en_US.aff / en_US.dic    # English — SCOWL-based (see LICENSE-en.txt)
  spelling/                  # Reserved for future ONNX spell models
```

## Roles

- **Correctness authority**: Hunspell (stems + affix rules → millions of forms:
  inflections, derivations, compounds) + curated typo overrides. No bundled
  wordlist is consulted — the old frequency lists were retired.
- **Proper nouns**: tiny curated exception set in `app/js/ai/proper-nouns.js`
  (Hunspell rejects names by design).
- **Neural context layer**: bert-mini masked-LM for context errors
  (`their/there`) — delivered on demand, served over the
  `ai-get-model-buffer` IPC channel.
- **Language detection**: per-paragraph nl/en auto-detect
  (`app/js/ai/lang-detect.js`, stopword scoring); the UI language is only
  the fallback for short or mixed text.

## Adding Models

1. Place ONNX models in the appropriate subdirectory
2. Run `npm run build` to include in the app bundle
3. Models are automatically unpacked from ASAR (see `asarUnpack` in package.json)

## Downloaded Models

Additional models are downloaded on-demand to:
- Windows: `%APPDATA%\Summie\ai-models\`
- macOS: `~/Library/Application Support/Summie/ai-models/`
- Linux: `~/.config/Summie/ai-models/`

Managed by the main process IPC handlers (`ai-download-model`, `ai-get-model-status`).
