/**
 * Type definitions for API requests and responses
 */

export interface AttentionPattern {
  sourceLayer: number;
  sourceToken: number;
  destLayer: number;
  destToken: number;
  weight: number;
  head: number;
  headType?: string;
}

export interface ModelInfo {
  name: string;
  layers: number;
  heads: number;
  architecture: string;
}

export interface GraphData {
  numLayers: number;
  numTokens: number;
  numHeads: number;
  attentionPatterns: AttentionPattern[];
  tokens?: string[];
  model_name?: string;
  model_info?: ModelInfo;
}

export interface HealthResponse {
  status: string;
  loaded_models?: string[];
}

export interface ModelsResponse {
  models: string[];
}

export interface ProcessTextRequest {
  text: string;
  model_name: string;
} 