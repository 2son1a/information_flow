/**
 * API Service for communicating with the backend
 */
import { GraphData, HealthResponse, ModelsResponse, ProcessTextRequest } from './types';
import { SUPPORTED_MODELS, SupportedModel } from '../config/models';

// Get the API URL from environment or use default
const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://0.0.0.0:8000';
  
  // If running in browser and the API URL is using http when we're on https, 
  // try to use https for the API as well
  if (typeof window !== 'undefined' && 
      window.location.protocol === 'https:' && 
      apiUrl.startsWith('http:')) {
    const httpsUrl = apiUrl.replace('http:', 'https:');
    console.log(`Using HTTPS API URL: ${httpsUrl} (original: ${apiUrl})`);
    return httpsUrl;
  }
  
  // Remove trailing slash if present
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
};

// Default fetch options for all API calls
const defaultOptions: RequestInit = {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  }
};

/**
 * Check if the backend is available
 * @returns Promise resolving to the backend status
 */
export const checkBackendHealth = async (): Promise<HealthResponse> => {
  console.log(`Checking backend health at: ${getApiUrl()}/health`);
  const response = await fetch(`${getApiUrl()}/health`, defaultOptions);
  
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Get available models from the backend
 * @returns Promise resolving to the available models
 */
export const getAvailableModels = async (): Promise<SupportedModel[]> => {
  try {
    // First try to get models from the health endpoint
    const healthResponse = await checkBackendHealth();
    
    // Add any additional models from the backend that aren't in our default list
    if (healthResponse?.loaded_models?.length) {
      console.log("Retrieved models from health endpoint:", healthResponse.loaded_models);
      return [...new Set([...SUPPORTED_MODELS, ...healthResponse.loaded_models])] as SupportedModel[];
    }
    
    return SUPPORTED_MODELS;
  } catch (error) {
    console.error("Error getting available models:", error);
    // Even if backend is unavailable, return supported models
    return SUPPORTED_MODELS;
  }
};

/**
 * Process text with the specified model
 * @param text Text to process
 * @param modelName Model to use for processing
 * @returns Promise resolving to the processed data
 */
export const processText = async (text: string, modelName: SupportedModel): Promise<GraphData> => {
  const payload: ProcessTextRequest = {
    text,
    model_name: modelName
  };
  
  console.log(`Processing text with model ${modelName} at: ${getApiUrl()}/process`);
  const response = await fetch(`${getApiUrl()}/process`, {
    ...defaultOptions,
    method: 'POST',
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status}: ${errorText || 'Failed to process text'}`);
  }
  
  return await response.json();
};

// Export default object with all services
export default {
  checkBackendHealth,
  getAvailableModels,
  processText
}; 