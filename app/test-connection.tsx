'use client';

import { useState, useEffect } from 'react';
import apiService from './api/service';

export default function TestConnection() {
  const [status, setStatus] = useState<string>('Checking connection...');
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [testText, setTestText] = useState<string>('When Mary and John went to the store, Mary gave a drink to');
  const [processingResult, setProcessingResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    // Get the API URL used by the service
    setBackendUrl(process.env.NEXT_PUBLIC_API_URL || 'http://0.0.0.0:8000');
    
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      setStatus('Checking connection...');
      setError(null);
      
      // Check health endpoint
      const healthData = await apiService.checkBackendHealth();
      setStatus(`Connected to backend! Status: ${healthData.status}`);
      
      // Get available models
      const availableModels = await apiService.getAvailableModels();
      setModels(availableModels);
    } catch (err) {
      console.error('Connection test failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('Failed to connect to backend');
    }
  }

  async function handleProcessText() {
    if (!testText.trim()) return;
    
    try {
      setIsProcessing(true);
      setError(null);
      
      // Use the first available model or default to gpt2-small
      const modelToUse = models.length > 0 ? models[0] : 'gpt2-small';
      
      const result = await apiService.processText(testText, modelToUse);
      
      // Just show the first few tokens for demonstration
      const tokens = result.tokens || [];
      const tokenDisplay = tokens.length > 0 
        ? `Tokens: ${tokens.slice(0, Math.min(5, tokens.length)).join(', ')}${tokens.length > 5 ? '...' : ''}`
        : 'No tokens returned';
        
      setProcessingResult(`Successfully processed text with model ${modelToUse}. ${tokenDisplay}`);
    } catch (err) {
      console.error('Processing test failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setProcessingResult(null);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-4">Backend Connection Test</h2>
      
      <div className="mb-4">
        <p className="text-gray-700"><strong>API URL:</strong> {backendUrl}</p>
        <p className="text-gray-700 mt-2"><strong>Status:</strong> 
          <span className={status.includes('Failed') ? 'text-red-500' : 'text-green-500'}>
            {' '}{status}
          </span>
        </p>
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}
      </div>
      
      {models.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-semibold mb-2">Available Models</h3>
          <ul className="list-disc pl-5">
            {models.map((model, index) => (
              <li key={index} className="text-gray-700">{model}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-2">Test Processing</h3>
        <div className="mt-2">
          <textarea
            className="w-full p-2 border border-gray-300 rounded"
            rows={3}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Enter text to process..."
          />
        </div>
        <button
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          onClick={handleProcessText}
          disabled={isProcessing || !testText.trim()}
        >
          {isProcessing ? 'Processing...' : 'Process Text'}
        </button>
        
        {processingResult && (
          <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            <p>{processingResult}</p>
          </div>
        )}
      </div>
      
      <div className="mt-6">
        <button
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          onClick={checkConnection}
        >
          Recheck Connection
        </button>
      </div>
    </div>
  );
} 