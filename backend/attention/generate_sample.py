from model import AttentionPatternExtractor, AVAILABLE_MODELS
import json
import os

def generate_sample_data():
    # Create output directory if it doesn't exist
    output_dir = "../../app/data"
    os.makedirs(output_dir, exist_ok=True)
    
    # Sample text to use for all models
    text = "When Mary and John went to the store, John gave a drink to"
    
    # Generate sample data for each available model
    for model_name in AVAILABLE_MODELS:
        print(f"\nGenerating sample data for model: {model_name}")
        
        # Initialize the model with the specific model name
        extractor = AttentionPatternExtractor(model_name=model_name)
        
        # Generate attention patterns for sample text
        result = extractor.process_text(text)
        
        # Save to model-specific JSON file
        output_path = f"{output_dir}/sample-attention-{model_name}.json"
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        
        print(f"Sample attention patterns saved to {output_path}")
        print(f"Number of tokens: {result['numTokens']}")
        print(f"Number of attention patterns: {len(result['attentionPatterns'])}")
        print(f"Tokens: {result['tokens']}")

if __name__ == "__main__":
    generate_sample_data() 