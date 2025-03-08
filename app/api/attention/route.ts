import { NextResponse } from 'next/server';

export interface AttentionRequest {
  tokens: string[];  // The actual tokens
  layerAttentions: {
    layer: number;
    heads: number[][];  // [head][position] -> attention weights
  }[];
}

export async function POST(request: Request) {
  try {
    const data: AttentionRequest = await request.json();
    
    // Transform the data into the format our visualization expects
    const numLayers = data.layerAttentions.length;
    const numTokens = data.tokens.length;
    const numHeads = data.layerAttentions[0].heads.length;
    
    const attentionPatterns = [];
    
    // For each layer
    for (let l = 0; l < numLayers; l++) {
      const layerData = data.layerAttentions[l];
      // For each head
      for (let h = 0; h < numHeads; h++) {
        const headWeights = layerData.heads[h];
        // For each token pair
        for (let srcT = 0; srcT < numTokens; srcT++) {
          for (let destT = 0; destT < numTokens; destT++) {
            attentionPatterns.push({
              sourceLayer: l,
              sourceToken: srcT,
              destLayer: l + 1,
              destToken: destT,
              weight: headWeights[srcT * numTokens + destT],
              head: h
            });
          }
        }
      }
    }
    
    return NextResponse.json({
      numLayers: numLayers + 1, // +1 because we show source and destination layers
      numTokens,
      numHeads,
      attentionPatterns,
      tokens: data.tokens
    });
  } catch (error) {
    console.error('Error processing attention data:', error);
    return NextResponse.json(
      { error: 'Failed to process attention data' },
      { status: 400 }
    );
  }
} 