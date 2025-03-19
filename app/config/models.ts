export const SUPPORTED_MODELS = ["gpt2-small", "pythia-2.8b"];

export type SupportedModel = typeof SUPPORTED_MODELS[number];

export const DEFAULT_MODEL: SupportedModel = "gpt2-small";

export const MODEL_INFO: Record<SupportedModel, { layers: number; heads: number }> = {
  "gpt2-small": { layers: 12, heads: 12 },
  "pythia-2.8b": { layers: 32, heads: 32 }
}; 