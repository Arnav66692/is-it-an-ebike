// Runs the photo pilot v3 pedal check in the browser the way the test page did: OWLv2 q4 on WebGPU with
// transformers.js 3.8.1 from jsDelivr, the same 20-query batch and one call on the whole photo. Nothing
// here loads until the user taps, and the photo never leaves the device.

import { shrinkPhoto } from "./shrink";
import { PEDAL_MODEL, PEDAL_QUERIES, pedalCall, pedalScore, type PedalCall } from "./pedalRule";

const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

/** The test photos were at most 1,024 px on the long side, so bigger phone photos are shrunk to that. */
const MAX_SIDE = 1024;

interface Tensor {
  data: Float32Array;
  dims: number[];
  dispose?: () => void;
}

interface LoadEvent {
  status: string;
  file?: string;
  progress?: number;
}

interface TransformersLib {
  RawImage: { read(url: string): Promise<unknown> };
  AutoProcessor: { from_pretrained(id: string): Promise<(image: unknown) => Promise<{ pixel_values: Tensor }>> };
  AutoTokenizer: { from_pretrained(id: string): Promise<(texts: readonly string[], opts: { padding: boolean; truncation: boolean }) => Record<string, Tensor>> };
  AutoModelForZeroShotObjectDetection: {
    from_pretrained(
      id: string,
      opts: { dtype: string; device: string; progress_callback?: (e: LoadEvent) => void; session_options?: { logSeverityLevel: number } },
    ): Promise<(inputs: Record<string, Tensor>) => Promise<Record<string, Tensor>>>;
  };
}

interface Loaded {
  lib: TransformersLib;
  processor: (image: unknown) => Promise<{ pixel_values: Tensor }>;
  model: (inputs: Record<string, Tensor>) => Promise<Record<string, Tensor>>;
  textInputs: Record<string, Tensor>;
}

export interface PedalResult {
  score: number;
  call: PedalCall;
  ms: number;
}

/** True when this browser can give the page a WebGPU adapter. */
export async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

let loading: Promise<Loaded> | null = null;

function load(onProgress: (fraction: number) => void): Promise<Loaded> {
  if (loading) return loading;
  loading = (async () => {
    const lib = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB_URL)) as TransformersLib;
    const progress = (e: LoadEvent) => {
      if (e.status === "progress" && e.file?.endsWith(PEDAL_MODEL.file) && typeof e.progress === "number") onProgress(e.progress / 100);
    };
    const [processor, tokenizer, model] = await Promise.all([
      lib.AutoProcessor.from_pretrained(PEDAL_MODEL.id),
      lib.AutoTokenizer.from_pretrained(PEDAL_MODEL.id),
      // Log level 3 hides onnxruntime's routine note about CPU-placed shape ops, which it prints as a console
      // error. It changes nothing in the computation.
      lib.AutoModelForZeroShotObjectDetection.from_pretrained(PEDAL_MODEL.id, {
        dtype: "q4",
        device: "webgpu",
        progress_callback: progress,
        session_options: { logSeverityLevel: 3 },
      }),
    ]);
    return { lib, processor, model, textInputs: tokenizer(PEDAL_QUERIES, { padding: true, truncation: true }) };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

function shrink(file: File): Promise<Blob> {
  return shrinkPhoto(file, MAX_SIDE, "image/png");
}

export async function runPedalCheck(file: File, onProgress: (fraction: number) => void): Promise<PedalResult> {
  const { lib, processor, model, textInputs } = await load(onProgress);
  onProgress(1);
  const started = performance.now();
  const url = URL.createObjectURL(await shrink(file));
  try {
    const image = await lib.RawImage.read(url);
    const inputs = await processor(image);
    const output = await model({ ...textInputs, pixel_values: inputs.pixel_values });
    const [, boxes, queries] = output.logits.dims;
    const logits = output.logits.data;
    const best: Record<string, number> = {};
    PEDAL_QUERIES.forEach((q, j) => {
      let top = Number.NEGATIVE_INFINITY;
      for (let b = 0; b < boxes; b += 1) top = Math.max(top, logits[b * queries + j]);
      best[q] = top;
    });
    for (const tensor of [...Object.values(output), inputs.pixel_values]) tensor.dispose?.();
    const score = pedalScore(best);
    return { score, call: pedalCall(score), ms: Math.round(performance.now() - started) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
