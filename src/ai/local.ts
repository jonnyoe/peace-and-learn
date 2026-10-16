import * as FS from 'expo-file-system/legacy';
import { initLlama, LlamaContext } from 'llama.rn';
import { MODELS, ModelInfo } from './models';
import { SCHEMA, SYSTEM, userMessage, KnownConcept } from './prompt';

const DIR = FS.documentDirectory + 'models/';
const pathFor = (m: ModelInfo) => DIR + m.file;

const STOP = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|endoftext|>'];

// ---------- Downloads ----------
export async function isDownloaded(m: ModelInfo) {
  const info = await FS.getInfoAsync(pathFor(m));
  return info.exists && (info.size ?? 0) > 50_000_000;
}

let activeDownload: FS.DownloadResumable | null = null;

export async function downloadModel(m: ModelInfo, onProgress: (fraction: number) => void) {
  await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  activeDownload = FS.createDownloadResumable(m.url, pathFor(m), {}, p => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  try {
    const res = await activeDownload.downloadAsync();
    if (!res || res.status !== 200) {
      await FS.deleteAsync(pathFor(m), { idempotent: true });
      throw new Error(`Download failed (HTTP ${res?.status ?? '?'})`);
    }
  } finally {
    activeDownload = null;
  }
}

export async function cancelDownload() {
  await activeDownload?.cancelAsync();
}

export async function deleteModel(m: ModelInfo) {
  if (loadedId === m.id) await unload();
  await FS.deleteAsync(pathFor(m), { idempotent: true });
}

// ---------- Inference ----------
let ctx: LlamaContext | null = null;
let loadedId: string | null = null;

export async function unload() {
  await ctx?.release();
  ctx = null;
  loadedId = null;
}

async function ensureLoaded(modelId: string, onStatus: (s: string) => void) {
  if (ctx && loadedId === modelId) return ctx;
  await unload();
  const m = MODELS.find(x => x.id === modelId);
  if (!m || !(await isDownloaded(m))) throw new Error('Download a model on the Model tab first.');
  onStatus(`Loading ${m.name}…`);
  ctx = await initLlama(
    { model: pathFor(m), n_ctx: 4096, n_gpu_layers: 99, use_mlock: false },
    p => onStatus(`Loading ${m.name}… ${Math.round(p)}%`),
  );
  loadedId = modelId;
  return ctx;
}

export async function generateLocal(
  modelId: string, text: string, domain: string, known: KnownConcept[], onStatus: (s: string) => void,
): Promise<string> {
  const c = await ensureLoaded(modelId, onStatus);
  let tokens = 0;
  const res = await c.completion(
    {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage(text, domain, known) },
      ],
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: SCHEMA } },
      enable_thinking: false, // Qwen3: skip the reasoning block, go straight to JSON
      n_predict: 1600,
      temperature: 0.3,
      stop: STOP,
    },
    () => {
      tokens++;
      if (tokens % 20 === 0) onStatus(`Writing cards… ${tokens} tokens`);
    },
  );
  return res.text;
}

export async function stopGenerating() {
  await ctx?.stopCompletion();
}
