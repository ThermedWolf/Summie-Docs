// ==================== AI INFERENCE WORKER ====================
// Runs ONNX inference off the main thread.

let ort = null;
const sessions = new Map();

// Initialize ONNX Runtime in worker
async function initORT() {
    if (ort) return ort;
    const { create } = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.js');
    ort = await create();
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
    return ort;
}

// Load model in worker
async function loadModelInWorker(modelInfo, modelBuffer) {
    await initORT();
    const session = await ort.InferenceSession.create(modelBuffer);
    sessions.set(modelInfo.id, { session, info: modelInfo });
    return session;
}

// Run inference
async function runInferenceInWorker(modelId, inputIds, attentionMask) {
    const cached = sessions.get(modelId);
    if (!cached) throw new Error(`Model not loaded: ${modelId}`);

    const { session, info } = cached;

    const feeds = {
        [info.inputNames[0]]: new ort.Tensor('int64', BigInt64Array.from(inputIds), [1, inputIds.length]),
        [info.inputNames[1]]: new ort.Tensor('int64', BigInt64Array.from(attentionMask), [1, attentionMask.length]),
    };

    const results = await session.run(feeds);
    return results[info.outputNames[0]].data;
}

// Handle messages from main thread
self.onmessage = async function (event) {
    const { id, type, payload } = event.data;

    try {
        let result;

        switch (type) {
            case 'load-model': {
                const { modelInfo, modelBuffer } = payload;
                await loadModelInWorker(modelInfo, modelBuffer);
                result = { success: true };
                break;
            }

            case 'run-inference': {
                const { modelId, inputIds, attentionMask } = payload;
                const output = await runInferenceInWorker(modelId, inputIds, attentionMask);
                result = { output: Array.from(output) };
                break;
            }

            case 'preload': {
                // Preload multiple models
                const { models } = payload; // Array of { modelInfo, modelBuffer }
                await Promise.all(models.map(m => loadModelInWorker(m.modelInfo, m.modelBuffer)));
                result = { success: true };
                break;
            }

            default:
                throw new Error(`Unknown worker command: ${type}`);
        }

        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};