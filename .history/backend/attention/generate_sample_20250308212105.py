from model import AttentionPatternExtractor
import json

def generate_sample_data():
    # Initialize the model
    extractor = AttentionPatternExtractor()
    
    # Generate attention patterns for sample text
    text = "The quick brown fox jumped over the lazy dog"
    result = extractor.process_text(text)
    
    # Save to JSON file
    output_path = "../../app/data/sample-attention.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"Sample attention patterns saved to {output_path}")
    print(f"Number of tokens: {result['numTokens']}")
    print(f"Number of attention patterns: {len(result['attentionPatterns'])}")

if __name__ == "__main__":
    generate_sample_data() 