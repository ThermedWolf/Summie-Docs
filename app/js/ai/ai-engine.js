// ==================== AI ENGINE ====================
// Core ONNX Runtime Web wrapper with Web Worker inference.
// Handles model loading, caching, and device-tier-aware model selection.

(function () {
    'use strict';

    // Model registry with tier info and download URLs
    const MODEL_REGISTRY = {
        spelling: {
            tiny: {
                id: 'spelling-tiny',
                name: 'Tiny Spell (Multilingual)',
                sizeMB: 15,
                bundled: true,
                path: 'ai-models/spelling/tiny-spell-multilingual.onnx',
                languages: ['nl', 'en'],
                tier: 'low',
                inputNames: ['input_ids', 'attention_mask'],
                outputNames: ['logits'],
                maxLength: 128,
            },
            small: {
                id: 'spelling-small',
                name: 'Small Spell (Multilingual)',
                sizeMB: 45,
                bundled: false,
                downloadUrl: 'https://huggingface.co/ThermedWolf/summie-ai-models/resolve/main/spelling-small.onnx',
                languages: ['nl', 'en'],
                tier: 'mid',
                inputNames: ['input_ids', 'attention_mask'],
                outputNames: ['logits'],
                maxLength: 256,
            },
        },
        grammar: {
            nl: {
                id: 'grammar-nl',
                name: 'Dutch Grammar',
                sizeMB: 50,
                bundled: false,
                downloadUrl: 'https://huggingface.co/ThermedWolf/summie-ai-models/resolve/main/grammar-nl.onnx',
                languages: ['nl'],
                tier: 'mid',
                inputNames: ['input_ids', 'attention_mask'],
                outputNames: ['logits'],
                maxLength: 256,
            },
            en: {
                id: 'grammar-en',
                name: 'English Grammar',
                sizeMB: 50,
                bundled: false,
                downloadUrl: 'https://huggingface.co/ThermedWolf/summie-ai-models/resolve/main/grammar-en.onnx',
                languages: ['en'],
                tier: 'mid',
                inputNames: ['input_ids', 'attention_mask'],
                outputNames: ['logits'],
                maxLength: 256,
            },
        },
    };

    // In-memory model cache
    const modelCache = new Map();
    const sessionCache = new Map();
    let ort = null; // onnxruntime-web instance
    let worker = null;
    let deviceTier = null;

    // Determine device tier based on available memory
    function detectDeviceTier() {
        if (deviceTier) return deviceTier;

        // navigator.deviceMemory is in GB, approximate
        const memGB = navigator.deviceMemory || 4;
        if (memGB >= 16) deviceTier = 'high';
        else if (memGB >= 8) deviceTier = 'mid';
        else deviceTier = 'low';

        // Allow override via settings
        if (window.AISettings && window.AISettings.modelTier && window.AISettings.modelTier !== 'auto') {
            deviceTier = window.AISettings.modelTier;
        }

        return deviceTier;
    }

    // Initialize ONNX Runtime.
    // NOTE: remote CDN imports are blocked by the app CSP (script-src 'self'),
    // so the runtime must be bundled locally before ML inference can run.
    // Until then init() reports unavailable and every checker quietly falls
    // back to its dictionary/rule-based implementation — no console errors.
    let ortUnavailable = false;
    async function init() {
        if (ort) return ort;
        if (ortUnavailable) throw new Error('ONNX Runtime not bundled yet (local AI models pending)');
        // A future build may expose a locally bundled runtime as window.ort.
        if (window.ort && window.ort.InferenceSession) {
            ort = window.ort;
            detectDeviceTier();
            console.log('[AI Engine] Initialized (bundled runtime), device tier:', deviceTier);
            return ort;
        }
        ortUnavailable = true;
        throw new Error('ONNX Runtime not bundled yet (local AI models pending)');
    }

    // Worker message handler
    const pendingRequests = new Map();
    let requestId = 0;

    function handleWorkerMessage(event) {
        const { id, result, error, progress } = event.data;
        const pending = pendingRequests.get(id);
        if (!pending) return;

        if (progress !== undefined) {
            if (pending.onProgress) pending.onProgress(progress);
            return;
        }

        pendingRequests.delete(id);
        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(result);
        }
    }

    function sendToWorker(type, payload, onProgress) {
        const id = ++requestId;
        return new Promise((resolve, reject) => {
            pendingRequests.set(id, { resolve, reject, onProgress });
            worker.postMessage({ id, type, payload });
        });
    }

    // Get model info for a task and language
    function getModelInfo(task, language) {
        const taskModels = MODEL_REGISTRY[task];
        if (!taskModels) return null;

        // For spelling, use multilingual model
        if (task === 'spelling') {
            return taskModels.tiny; // Always use tiny for now (bundled)
        }

        // For grammar, use language-specific
        return taskModels[language] || taskModels.en;
    }

    // Load model bytes over IPC (works in dev and in packaged builds, where
    // file:// fetch cannot reach extraResources). Returns null when the
    // model is not installed — callers treat that as "use fallback".
    async function loadModelBuffer(modelId) {
        try {
            if (window.electron && window.electron.aiGetModelBuffer) {
                const res = await window.electron.aiGetModelBuffer(modelId);
                if (res && res.success && res.base64) {
                    const bin = atob(res.base64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    return bytes.buffer;
                }
            }
        } catch { /* not installed — fall through */ }
        return null;
    }

    // Load model (from bundle or download)
    async function loadModel(task, language) {
        const modelInfo = getModelInfo(task, language);
        if (!modelInfo) throw new Error(`No model for task ${task}, language ${language}`);

        const cacheKey = `${task}-${language}`;
        if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);

        const modelBuffer = await loadModelBuffer(modelInfo.id);
        if (!modelBuffer) throw new Error(`AI model not installed: ${modelInfo.id}`);

        // Create ONNX session
        await init();
        const session = await ort.InferenceSession.create(modelBuffer);
        sessionCache.set(cacheKey, session);
        modelCache.set(cacheKey, { session, info: modelInfo });

        console.log(`[AI Engine] Loaded model: ${modelInfo.name}`);
        return { session, info: modelInfo };
    }

    // NOTE: on-demand downloads run in the main process (ai-download-model IPC
    // handler) so the renderer never needs fetch-to-file logic here.
    // Run inference on a model
    async function runInference(task, language, inputIds, attentionMask) {
        const cacheKey = `${task}-${language}`;
        let cached = sessionCache.get(cacheKey);

        if (!cached) {
            cached = await loadModel(task, language);
        }

        const { session, info } = cached;

        // Prepare inputs
        const feeds = {
            [info.inputNames[0]]: new ort.Tensor('int64', BigInt64Array.from(inputIds), [1, inputIds.length]),
            [info.inputNames[1]]: new ort.Tensor('int64', BigInt64Array.from(attentionMask), [1, attentionMask.length]),
        };

        // Run inference
        const results = await session.run(feeds);
        return results[info.outputNames[0]].data;
    }

    // Tokenize text for model input (simple whitespace + punctuation tokenizer)
    // In production, use a proper tokenizer (e.g., from @xenova/transformers)
    function tokenize(text, maxLength) {
        // Simple character-level tokenization for demo
        // Real implementation would use BERT/WordPiece tokenizer
        const tokens = text.toLowerCase().split('');
        const inputIds = tokens.map(t => t.charCodeAt(0)).slice(0, maxLength - 2);
        const attentionMask = new Array(inputIds.length).fill(1);

        // Pad to maxLength
        while (inputIds.length < maxLength) {
            inputIds.push(0);
            attentionMask.push(0);
        }

        return { inputIds, attentionMask };
    }

    // High-level API: check spelling
    async function checkSpelling(text, language) {
        const { inputIds, attentionMask } = tokenize(text, 128);
        const logits = await runInference('spelling', language, inputIds, attentionMask);
        return logits; // Raw logits, post-process in spell-checker.js
    }

    // High-level API: check grammar
    async function checkGrammar(sentence, language) {
        const { inputIds, attentionMask } = tokenize(sentence, 256);
        const logits = await runInference('grammar', language, inputIds, attentionMask);
        return logits;
    }

    // Preload models for current language.
    // Only attempts models confirmed installed via IPC; anything missing
    // rejects quietly so checkers fall back without console noise.
    async function preloadForLanguage(language) {
        let status = null;
        try {
            if (window.electron && window.electron.aiGetModelStatus) {
                status = await window.electron.aiGetModelStatus();
            }
        } catch { /* IPC unavailable — fall through to quiet reject */ }

        const spellInfo = getModelInfo('spelling', language);
        if (!status || !status[spellInfo.id] || !status[spellInfo.id].installed) {
            throw new Error(`AI model not installed: ${spellInfo.id} (placeholder only)`);
        }
        await loadModel('spelling', language);

        const tier = detectDeviceTier();
        if (tier !== 'low') {
            const grammarInfo = getModelInfo('grammar', language);
            if (status[grammarInfo.id] && status[grammarInfo.id].installed) {
                await loadModel('grammar', language);
            }
        }
    }

    // Get download status for models
    async function getModelStatus() {
        const status = {};
        for (const [task, models] of Object.entries(MODEL_REGISTRY)) {
            for (const [lang, info] of Object.entries(models)) {
                if (task === 'spelling' && lang !== 'tiny') continue;
                const cacheKey = `${task}-${lang}`;
                status[cacheKey] = {
                    ...info,
                    loaded: sessionCache.has(cacheKey),
                    cached: modelCache.has(cacheKey),
                };
            }
        }
        return status;
    }

    // Expose API
    window.AIEngine = {
        init,
        loadModel,
        runInference,
        checkSpelling,
        checkGrammar,
        preloadForLanguage,
        getModelStatus,
        detectDeviceTier,
        getModelInfo,
        MODEL_REGISTRY,
    };

    // No eager auto-init: the runtime resolves lazily on the first
    // preloadForLanguage() call, so a missing model never spams the
    // console at startup.
})();