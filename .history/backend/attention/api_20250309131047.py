from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
from .model import AttentionPatternExtractor
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Attention Pattern API",
    description="API for extracting attention patterns from transformer models",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model
try:
    model = AttentionPatternExtractor()
    logger.info("Model initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize model: {str(e)}")
    raise

class TextRequest(BaseModel):
    text: str

@app.post("/process")
async def process_text(request: TextRequest) -> Dict[str, Any]:
    """Process text and return attention patterns.
    
    Args:
        request: TextRequest object containing the text to analyze
        
    Returns:
        Dictionary containing:
            - numLayers: number of layers
            - numTokens: number of tokens
            - numHeads: number of attention heads
            - tokens: list of tokens
            - attentionPatterns: list of attention patterns
    """
    try:
        logger.info(f"Processing text: {request.text[:50]}...")
        result = model.process_text(request.text)
        logger.info(f"Successfully processed text. Generated {len(result['attentionPatterns'])} patterns")
        return result
    except Exception as e:
        logger.error(f"Error processing text: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "model_loaded": model is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 