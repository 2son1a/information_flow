import torch
from transformer_lens import HookedTransformer
from transformer_lens.head_detector import detect_head 
from typing import Dict, List, Tuple, Any
import numpy as np

class AttentionPatternExtractor:
    def __init__(self, model_name: str = "gpt2-small"):
        """Initialize the model for attention pattern extraction.
        
        Args:
            model_name: Name of the pretrained model to use
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = HookedTransformer.from_pretrained(
            model_name,
            device=self.device,
            dtype=torch.float32
        )
        self.model.eval()
        
        # Cache model configuration
        self.n_layers = self.model.cfg.n_layers
        self.n_heads = self.model.cfg.n_heads
        
    def get_attention_patterns(self, text: str) -> Dict[str, Any]:
        """Extract attention patterns from input text.
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary containing:
                - tokens: List of tokens
                - layerAttentions: List of attention patterns per layer
        """
        # Tokenize input text
        tokens = self.model.to_tokens(text)
        tokens_list = self.model.to_str_tokens(text)
        n_tokens = len(tokens_list)
        
        # Store attention patterns
        patterns = []
        
        def save_pattern(activation, hook):
            # Remove batch dimension and store
            pattern = activation.detach().squeeze(0).cpu().numpy()
            pattern = pattern[:, 1:, 1:]  # Remove BOS token
            # Set upper triangular part to zero (prevent attending to future tokens)
            for h in range(pattern.shape[0]):   For each head
                pattern[h] = np.tril(pattern[h])
            patterns.append(pattern)
        
        # Run model with hooks to capture attention patterns
        pattern_filter = lambda name: "hook_pattern" in name
        self.model.run_with_hooks(
            text,
            return_type=None,
            fwd_hooks=[(pattern_filter, save_pattern)]
        )
        
        # Convert patterns to the expected format
        layer_attentions = []
        head_types = {}

        for layer_idx, layer_pattern in enumerate(patterns):
            # layer_pattern shape: (n_heads, seq_len, seq_len)
            heads_attention = []
            for head_idx in range(self.n_heads):
                # Store the full attention matrix for each head
                head_pattern = layer_pattern[head_idx]
                heads_attention.append(head_pattern)
                head_type = detect_head(self.model, layer_idx, head_idx)
                head_types[(layer_idx, head_idx)] = head_type
            
            layer_attentions.append({
                "layer": layer_idx,
                "heads": heads_attention
            })
        
        return {
            "tokens": tokens_list[1:],
            "layerAttentions": layer_attentions,
            "headTypes": head_types
        }

    def process_text(self, text: str) -> Dict[str, Any]:
        """Process text and return data in the format expected by the frontend.
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary containing attention patterns and metadata
        """
        # Get attention patterns and tokens
        result = self.get_attention_patterns(text)
        tokens = result["tokens"]
        layer_attentions = result["layerAttentions"]
        
        # Transform data into the format expected by the frontend
        attention_patterns = []
        
        # For each layer
        for layer_data in layer_attentions:
            layer = layer_data["layer"]
            # For each head
            for head in range(self.n_heads):
                head_pattern = layer_data["heads"][head]  # This is now a 2D matrix
                # For each token pair
                for src_idx in range(len(tokens)):
                    for dest_idx in range(len(tokens)):
                        # Get attention weight directly from the pattern matrix
                        weight = float(head_pattern[dest_idx, src_idx])  # Note: matrix is [dest, src]
                        attention_patterns.append({
                            "sourceLayer": layer,
                            "sourceToken": src_idx,
                            "destLayer": layer + 1,  # Next layer
                            "destToken": dest_idx,
                            "weight": weight,
                            "head": head,
                            "headType": layer_data["heads"][head]["type"]
                        })
        
        return {
            "numLayers": self.n_layers + 1,  # +1 because we show source and destination layers
            "numTokens": len(tokens),
            "numHeads": self.n_heads,
            "tokens": tokens,
            "attentionPatterns": attention_patterns
        }

# Example usage:
if __name__ == "__main__":
    extractor = AttentionPatternExtractor()
    text = "The quick brown fox jumped over the lazy dog"
    patterns = extractor.process_text(text)
    print(f"Number of tokens: {patterns['numTokens']}")
    print(f"Number of attention patterns: {len(patterns['attentionPatterns'])}")
    print(f"Tokens: {patterns['tokens']}")
    print("\nSample attention patterns for first head:")
    # Print first few patterns for head 0 to verify weights
    head_0_patterns = [p for p in patterns["attentionPatterns"] if p["head"] == 0][:5]
    for p in head_0_patterns:
        print(f"Source token: {patterns['tokens'][p['sourceToken']]} -> Dest token: {patterns['tokens'][p['destToken']]}, Weight: {p['weight']:.4f}")
