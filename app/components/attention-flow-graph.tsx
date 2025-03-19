"use client";

import React, { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import apiService from '../api/service';

// Styles for custom range slider
const sliderStyles = `
  .custom-range {
    @apply appearance-none bg-transparent w-full h-6 cursor-pointer;
  }
  
  .custom-range::-webkit-slider-runnable-track {
    @apply h-[6px] rounded-full bg-gradient-to-r from-gray-200 to-gray-300;
  }
  
  .custom-range::-webkit-slider-thumb {
    @apply appearance-none h-4 w-4 rounded-full bg-white border border-[#3B82F6] shadow-md -mt-[4px];
    background: linear-gradient(to bottom, #ffffff, #f5f7fa);
  }
  
  .custom-range::-moz-range-track {
    @apply h-[6px] rounded-full bg-gradient-to-r from-gray-200 to-gray-300;
  }
  
  .custom-range::-moz-range-thumb {
    @apply h-4 w-4 rounded-full bg-white border border-[#3B82F6] shadow-md;
    background: linear-gradient(to bottom, #ffffff, #f5f7fa);
  }
  
  .custom-range:focus {
    @apply outline-none;
  }
  
  .custom-range:focus::-webkit-slider-thumb {
    @apply border-[#3B82F6] shadow-lg;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .custom-range:focus::-moz-range-thumb {
    @apply border-[#3B82F6] shadow-lg;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  /* Add colored track for active portion */
  .custom-range-wrapper {
    @apply relative w-full;
  }
  
  .custom-range-track {
    @apply absolute pointer-events-none h-[6px] bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] rounded-full;
    top: 50%;
    transform: translateY(-50%);
    z-index: 0;
  }
`;

// Add a new CSS style for smooth SVG rendering
const svgOptimizationStyles = `
  .svg-container {
    will-change: transform;
    contain: content;
    transform: translateZ(0);
  }
`;

interface AttentionPattern {
  sourceLayer: number;
  sourceToken: number;
  destLayer: number;
  destToken: number;
  weight: number;
  head: number;
  headType?: string;
} 

interface HeadPair {
  layer: number;
  head: number;
}

interface HeadGroup {
  id: number;
  name: string;
  heads: HeadPair[];
  description?: string;
}

interface GraphData {
  numLayers: number;
  numTokens: number;
  numHeads: number;
  attentionPatterns: AttentionPattern[];
  tokens?: string[];  // Optional array of actual tokens
  model_name?: string;
  model_info?: {
    name: string;
    layers: number;
    heads: number;
    architecture: string;
  };
}

interface Node {
  id: string;
  layer: number;
  token: number;
  x: number;
  y: number;
}

interface Link {
  source: string;
  target: string;
  weight: number;
  head: number;
  groupId: number;
}

interface PredefinedGroup {
  name: string;
  vertices: [number, number][];
  description?: string;
}

const AttentionFlowGraph = () => {
  const [data, setData] = useState<GraphData>({
    numLayers: 4,
    numTokens: 5,
    numHeads: 4,
    attentionPatterns: [],
    tokens: Array(5).fill('token')
  });
  const [threshold, setThreshold] = useState(0.4);
  const [selectedHeads, setSelectedHeads] = useState<HeadPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [headGroups, setHeadGroups] = useState<HeadGroup[]>([]);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const svgRef = useRef(null);
  const [headError, setHeadError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentModel, setCurrentModel] = useState<string>("gpt2-small");
  const [availableModels, setAvailableModels] = useState<string[]>(["gpt2-small", "pythia-2.8b"]);
  const [sampleAttentionDataMap, setSampleAttentionDataMap] = useState<Record<string, GraphData>>({});
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [lastProcessedText, setLastProcessedText] = useState<string>("");
  const [lastProcessedModel, setLastProcessedModel] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  
  // Graph dimensions
  const graphDimensions = {
    width: 1000,  // Increased width
    height: 700,  // Increased height
    padding: {
      top: 40,
      right: 180,  // Slightly reduced legend space
      bottom: 60,
      left: 60
    }
  };
  
  // Define model-specific predefined head groups
  const modelSpecificGroups = useMemo<Record<string, PredefinedGroup[]>>(() => ({
    "gpt2-small": [
      {
        name: "Name Mover",
        vertices: [[9, 9], [10, 0], [9, 6]],
        description: "Attend to names and copy them to output. Active at END token position."
      },
      {
        name: "Negative",
        vertices: [[10, 7], [11, 10]],
        description: "Write in opposite direction of Name Movers, decreasing prediction confidence."
      },
      {
        name: "S Inhibition",
        vertices: [[8, 10], [7, 9], [8, 6], [7, 3]],
        description: "Reduce Name Mover Heads' attention to subject tokens. Attend to S2 and modify query patterns."
      },
      {
        name: "Induction",
        vertices: [[5, 5], [5, 9], [6, 9], [5, 8]],
        description: "Recognize [A][B]...[A] patterns to detect duplicated tokens via different mechanism."
      },
      {
        name: "Duplicate Token",
        vertices: [[0, 1], [0, 10], [3, 0]],
        description: "Identify repeated tokens. Active at S2, attend to S1, signal token duplication."
      },
      {
        name: "Previous Token",
        vertices: [[4, 11], [2, 2]],
        description: "Copy subject information to the token after S1. Support Induction Heads."
      },
      {
        name: "Backup Name Mover",
        vertices: [[11, 2], [10, 6], [10, 10], [10, 2], [9, 7], [10, 1], [11, 9], [9, 0]],
        description: "Normally inactive but replace Name Movers if they're disabled. Show circuit redundancy."
      }
    ],
    "pythia-2.8b": [
      {
        name: "Subject Heads",
        vertices: [
          [17, 2],   // L17H2
          [16, 12],  // L16H12
          [21, 9],   // L21H9
          [16, 20],  // L16H20
          [22, 17],  // L22H17
          [18, 14]   // L18H14
        ],
        description: "Attend to subject tokens and extract their attributes. May activate even when irrelevant to the query."
      },
      {
        name: "Relation Heads",
        vertices: [
          [13, 31],  // L13H31
          [18, 20],  // L18H20
          [14, 24],  // L14H24
          [21, 18]   // L21H18
        ],
        description: "Focus on relation tokens and boost possible answers for that relation type. Operate independently of subjects."
      },
      {
        name: "Mixed Heads",
        vertices: [
          [17, 17],  // L17H17
          [21, 23],  // L21H23
          [23, 22],  // L23H22
          [26, 8],   // L26H8
          [22, 15],  // L22H15
          [17, 30],  // L17H30
          [18, 25]   // L18H25
        ],
        description: "Attend to both subject and relation tokens. Extract correct attributes more effectively through \"subject to relation propagation.\""
      }
    ]
  }), []);
  
  // Get predefined groups for the current model
  const predefinedGroups = useMemo<PredefinedGroup[]>(() => {
    // Default to empty array if no groups defined for this model
    return modelSpecificGroups[currentModel] || [];
  }, [currentModel, modelSpecificGroups]);
  
  // Wrap functions in useCallback
  const getHeadGroup = useCallback((layer: number, head: number): number | null => {
    const group = headGroups.find(g => g.heads.some(h => h.layer === layer && h.head === head));
    return group ? group.id : null;
  }, [headGroups]);

  const getVisibleHeads = useCallback((): HeadPair[] => {
    const groupedHeads = headGroups.flatMap(group => group.heads);
    const individualHeads = selectedHeads.filter(h => 
      !groupedHeads.some(gh => gh.layer === h.layer && gh.head === h.head)
    );
    return [...individualHeads, ...groupedHeads];
  }, [headGroups, selectedHeads]);

  const fetchAttentionData = useCallback(async (text: string) => {
    // Skip if we've already processed this text with this model
    // Add extra log to help with debugging
    if (text === lastProcessedText && currentModel === lastProcessedModel) {
      console.log("Skipping data fetch - text and model unchanged", {
        text,
        lastProcessedText,
        currentModel, 
        lastProcessedModel,
        areEqual: text === lastProcessedText && currentModel === lastProcessedModel
      });
      return;
    }
    
    console.log("Fetching attention data for text:", text, "with model:", currentModel);
    
    try {
      setTextError(null);
      setLoading(true);
      
      try {
        console.log("Making API request to process text");
        const result = await apiService.processText(text, currentModel);
        console.log("API request successful, updating data", result);
        
        // Update data first
        setData(result);
        
        // Then update the tracking variables - do this after data update
        // to ensure we don't skip processing on state change
        setLastProcessedText(text);
        setLastProcessedModel(currentModel);
      } catch (error) {
        console.error('Error fetching attention data:', error);
        
        // Check for specific error messages that might indicate model loading issues
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch attention data';
        
        if (errorMessage.includes('not loaded') || errorMessage.includes('not found') || errorMessage.includes('404')) {
          setTextError(`Model "${currentModel}" is not currently loaded on the backend. When you select a different model, the backend will try to load it. This may take some time for large models like Pythia.`);
        } else {
          setTextError(errorMessage);
        }
        
        // If backend fails, load sample data if available
        if (sampleAttentionDataMap[currentModel]) {
          console.log("Loading sample data due to API error");
          setData(sampleAttentionDataMap[currentModel]);
          // Update last processed info even when using sample data
          setLastProcessedText(text);
          setLastProcessedModel(currentModel);
        }
      }
    } finally {
      setLoading(false);
      console.log("Fetch operation completed, text processing finished");
    }
  }, [currentModel, sampleAttentionDataMap, lastProcessedText, lastProcessedModel]);

  // Create a ref to store the timeout ID
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check backend availability and fetch models
  useEffect(() => {
    const checkBackend = async () => {
      try {
        // Check if the backend is available
        await apiService.checkBackendHealth();
        
        // If it is, get the available models
        const models = await apiService.getAvailableModels();
        setAvailableModels(models.length > 0 ? models : ["gpt2-small", "pythia-2.8b"]);
        setBackendAvailable(true);
      } catch (error) {
        console.error("Error checking backend:", error);
        loadSampleData();
      }
    };
    
    // Helper function to load sample data when backend is unavailable
    const loadSampleData = () => {
      console.log("Loading sample data due to backend unavailability");
      // Use sample data if backend is not available
      if (Object.keys(sampleAttentionDataMap).length > 0) {
        // Use the current model's data if available
        if (sampleAttentionDataMap[currentModel]) {
          setData(sampleAttentionDataMap[currentModel]);
        } else {
          // Otherwise use the first available model data
          const firstModel = Object.keys(sampleAttentionDataMap)[0];
          setData(sampleAttentionDataMap[firstModel]);
          setCurrentModel(firstModel);
        }
        
        // Ensure we have at least one head selected when in sample mode
        if (selectedHeads.length === 0) {
          setSelectedHeads([{ layer: 0, head: 0 }]);
        }
      }
      setBackendAvailable(false);
    };
    
    checkBackend();
  }, [currentModel, sampleAttentionDataMap, selectedHeads.length]);

  // Get default text based on model
  const getDefaultTextForModel = useCallback((modelName: string): string => {
    // Convert to lowercase for case-insensitive matching
    const lowerCaseModel = modelName.toLowerCase();
    
    if (lowerCaseModel.includes('pythia')) {
      return "Fact: The Colosseum is in the country of";
    }
    
    // Default text for other models (e.g., GPT-2)
    return "When Mary and John went to the store, John gave a drink to";
  }, []);

  // Update the text input field when model changes
  useEffect(() => {
    const defaultText = getDefaultTextForModel(currentModel);
    setInputText(defaultText);
  }, [currentModel, getDefaultTextForModel]);

  // Remove the automatic text processing effect that watches for input changes
  // This is the effect that we need to remove or modify
  useEffect(() => {
    console.log("Text processing effect triggered:", {
      backendAvailable,
      inputText,
      lastProcessedText,
      currentModel,
      lastProcessedModel,
      shouldProcess: backendAvailable && inputText && 
          (inputText !== lastProcessedText || currentModel !== lastProcessedModel)
    });
    
    // REMOVE this automatic processing logic that runs on every input change
    // We'll keep just the initialization logic for when the component mounts
    if (backendAvailable && inputText && inputText.trim().length > 0 && 
        lastProcessedText === "" && lastProcessedModel === "") {
      console.log("Processing initial text through effect:", inputText, currentModel);
      fetchAttentionData(inputText);
    }
  }, [backendAvailable, inputText, currentModel, lastProcessedText, lastProcessedModel, fetchAttentionData]);

  // Simplify the handleTextChange function - now it only updates the state
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    console.log("Text changed to:", text);
    setInputText(text);
    // No processing happens here - just update the state
  };

  // Handle model change
  const handleModelChange = (newModel: string) => {
    // If the model hasn't changed, do nothing
    if (newModel === currentModel) {
      setIsModelDropdownOpen(false);
      return;
    }
    
    setCurrentModel(newModel);
    setIsModelDropdownOpen(false); // Close dropdown after selection
    
    // Reset selections when changing models
    setSelectedHeads([]);
    
    // Get default layer and token counts based on the model
    let defaultLayers = 4;
    let defaultTokens = 5;
    
    // Set appropriate defaults based on model
    if (newModel.toLowerCase().includes('gpt2')) {
      defaultLayers = 12;  // GPT2 has 12 layers
      defaultTokens = 5;
    } else if (newModel.toLowerCase().includes('pythia')) {
      defaultLayers = 32;  // Pythia-2.8b has 32 layers
      defaultTokens = 5;
    }
    
    // Reset SVG content to clear any existing visualization
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();
    }
    
    // Clear existing data when model changes with appropriate defaults for the model
    setData({
      numLayers: defaultLayers,
      numTokens: defaultTokens,
      numHeads: newModel.toLowerCase().includes('pythia') ? 32 : 12,  // Pythia has 32 heads, GPT2 has 12
      attentionPatterns: [],
      tokens: Array(defaultTokens).fill('token')
    });
    
    // Set model-specific default text
    const defaultText = getDefaultTextForModel(newModel);
    setInputText(defaultText);
    
    // Add a notification that the user needs to click Process Text after changing the model
    setTextError("Model changed. Click 'Process Text' to analyze with the new model.");
  };

  // Custom dropdown ref
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  
  // Handle clicks outside the model dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Element)) {
        setIsModelDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Initialize predefined head groups
  useEffect(() => {
    const initialGroups = predefinedGroups.map((group, index) => ({
      id: index,
      name: group.name,
      heads: group.vertices.map(([layer, head]) => ({ layer, head })),
      description: group.description
    }));

    setHeadGroups(initialGroups);
  }, [predefinedGroups, currentModel]);

  // Load model-specific sample data
  useEffect(() => {
    // Function to load sample data for a model
    const loadSampleData = async (modelName: string) => {
      try {
        const response = await fetch(`/data/sample-attention-${modelName}.json`);
        if (response.ok) {
          const data = await response.json() as GraphData;
          return data;
        } else {
          console.error(`Failed to load sample data for model ${modelName}`);
          return null;
        }
      } catch (error) {
        console.error(`Error loading sample data for model ${modelName}:`, error);
        return null;
      }
    };

    // Try to load sample data for all available models
    const loadAllSampleData = async () => {
      const dataMap: Record<string, GraphData> = {};
      for (const model of availableModels) {
        const modelData = await loadSampleData(model);
        if (modelData) {
          dataMap[model] = modelData;
        }
      }
      setSampleAttentionDataMap(dataMap);
      
      // Initialize with current model's data if available
      if (dataMap[currentModel]) {
        setData(dataMap[currentModel]);
      }
    };
    
    loadAllSampleData();
  }, [availableModels, currentModel]);
  
  // Update data when model changes
  useEffect(() => {
    if (sampleAttentionDataMap[currentModel]) {
      setData(sampleAttentionDataMap[currentModel]);
      
      // If no heads are selected and we're in sample data mode,
      // select a default head to allow interaction
      if (selectedHeads.length === 0 && !backendAvailable) {
        // Choose first head of the first layer as default
        setSelectedHeads([{ layer: 0, head: 0 }]);
      }
    }
  }, [currentModel, sampleAttentionDataMap, selectedHeads.length, backendAvailable]);

  useEffect(() => {
    const trackElement = document.querySelector('.custom-range-track') as HTMLDivElement;
    if (trackElement) {
      const percentage = threshold * 100;
      trackElement.style.width = `${percentage}%`;
    }
  }, [threshold]);

  // Update slider track position
  const updateTrackPosition = (value: number) => {
    const trackElement = document.querySelector('.custom-range-track') as HTMLDivElement;
    if (trackElement) {
      const percentage = value * 100;
      trackElement.style.width = `${percentage}%`;
    }
  };

  // Handle threshold change
  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setThreshold(value);
    
    // Update track width
    updateTrackPosition(value);
  };

  const handleHeadSelection = (input: string) => {
    try {
      const line = input.trim().split('\n')[0];
      if (!line) return;

      // Check for the ":,:" pattern to add all heads for all layers
      if (line.match(/^:\s*,\s*:$/)) {
        // We have a :,: pattern for all heads in all layers
        const headsToAdd: HeadPair[] = [];
        
        for (let layer = 0; layer < data.numLayers; layer++) {
          for (let head = 0; head < data.numHeads; head++) {
            // Skip if already selected or part of a group
            if (selectedHeads.some(h => h.layer === layer && h.head === head) ||
                headGroups.some(g => g.heads.some(h => h.layer === layer && h.head === head))) {
              continue;
            }
            
            headsToAdd.push({ layer, head });
          }
        }
        
        if (headsToAdd.length === 0) {
          setHeadError("All heads are already selected or in groups");
          return;
        }
        
        setSelectedHeads(prev => [...prev, ...headsToAdd]);
        setHeadError(null);
        return;
      }

      // Check for the "layer,:" pattern to add all heads for a layer
      const allHeadsPattern = /^(\d+)\s*,\s*:$/;
      const matchAllHeads = line.match(allHeadsPattern);
      
      if (matchAllHeads) {
        // We have a layer,: pattern
        const layer = parseInt(matchAllHeads[1]);
        
        // Validate layer number
        if (layer < 0 || layer >= data.numLayers) {
          setHeadError(`Layer must be 0-${data.numLayers - 1}`);
          return;
        }
        
        // Add all heads for this layer
        const headsToAdd: HeadPair[] = [];
        
        for (let head = 0; head < data.numHeads; head++) {
          // Skip if already selected or part of a group
          if (selectedHeads.some(h => h.layer === layer && h.head === head) ||
              headGroups.some(g => g.heads.some(h => h.layer === layer && h.head === head))) {
            continue;
          }
          
          headsToAdd.push({ layer, head });
        }
        
        if (headsToAdd.length === 0) {
          setHeadError("All heads in this layer are already selected or in groups");
          return;
        }
        
        setSelectedHeads(prev => [...prev, ...headsToAdd]);
        setHeadError(null);
        return;
      }
      
      // Check for the ":,head" pattern to add all layers for a head
      const allLayersPattern = /^:\s*,\s*(\d+)$/;
      const matchAllLayers = line.match(allLayersPattern);
      
      if (matchAllLayers) {
        // We have a :,head pattern
        const head = parseInt(matchAllLayers[1]);
        
        // Validate head number
        if (head < 0 || head >= data.numHeads) {
          setHeadError(`Head must be 0-${data.numHeads - 1}`);
          return;
        }
        
        // Add all layers for this head
        const headsToAdd: HeadPair[] = [];
        
        for (let layer = 0; layer < data.numLayers; layer++) {
          // Skip if already selected or part of a group
          if (selectedHeads.some(h => h.layer === layer && h.head === head) ||
              headGroups.some(g => g.heads.some(h => h.layer === layer && h.head === head))) {
            continue;
          }
          
          headsToAdd.push({ layer, head });
        }
        
        if (headsToAdd.length === 0) {
          setHeadError("All layers for this head are already selected or in groups");
          return;
        }
        
        setSelectedHeads(prev => [...prev, ...headsToAdd]);
        setHeadError(null);
        return;
      }
      
      // Original logic for single head selection
      const parts = line.split(',');
      if (parts.length !== 2) {
        setHeadError("Invalid format. Please use 'layer,head' (e.g., '0,1'), 'layer,:' for all heads in a layer, ':,head' for all layers of a head, or ':,:' for all heads");
        return;
      }

      const [layer, head] = parts.map(num => parseInt(num.trim()));
      if (isNaN(layer) || isNaN(head)) {
        setHeadError("Layer and head must be numbers");
        return;
      }

      if (layer < 0 || head < 0 || layer >= data.numLayers || head >= data.numHeads) {
        setHeadError(`Layer must be 0-${data.numLayers - 1} and head must be 0-${data.numHeads - 1}`);
        return;
      }

      if (getHeadGroup(layer, head) === null && 
          !selectedHeads.some(h => h.layer === layer && h.head === head)) {
        setSelectedHeads(prev => [...prev, { layer, head }]);
        setHeadError(null);
      } else if (getHeadGroup(layer, head) !== null) {
        setHeadError("This head is already part of a group");
      } else {
        setHeadError("This head is already selected");
      }
    } catch {
      setHeadError("Invalid input format");
    }
  };

  const addHeadToGroup = (layer: number, head: number, groupId: number) => {
    setHeadGroups(prev => {
      // Find the target group
      const targetGroup = prev.find(g => g.id === groupId);
      if (!targetGroup) return prev;

      // Toggle the head in this group
      const isInGroup = targetGroup.heads.some(h => h.layer === layer && h.head === head);
      
      return prev.map(group =>
        group.id === groupId
          ? {
              ...group,
              heads: isInGroup
                ? group.heads.filter(h => !(h.layer === layer && h.head === head))
                : [...group.heads, { layer, head }]
            }
          : group
      );
    });
  };

  const removeHead = (layer: number, head: number, groupId?: number) => {
    if (groupId !== undefined) {
      // Remove from a specific group
      setHeadGroups(prev => prev.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            heads: group.heads.filter(h => !(h.layer === layer && h.head === head))
          };
        }
        return group;
      }));
    } else {
      // Remove from selected heads
      setSelectedHeads(prev => prev.filter(h => !(h.layer === layer && h.head === head)));
    }
  };

  // Add function to create a new head group
  const createNewGroup = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate group name
    if (!newGroupName.trim()) {
      setGroupError("Group name is required");
      return;
    }
    
    // Check for duplicate names
    if (headGroups.some(g => g.name.toLowerCase() === newGroupName.trim().toLowerCase())) {
      setGroupError("A group with this name already exists");
      return;
    }
    
    // Create new group
    const newGroup: HeadGroup = {
      id: headGroups.length > 0 ? Math.max(...headGroups.map(g => g.id)) + 1 : 0,
      name: newGroupName.trim(),
      heads: [],
    };
    
    // Add new group at the beginning of the array so it appears at the top
    setHeadGroups(prev => [newGroup, ...prev]);
    setNewGroupName('');
    setGroupError(null);
  };

  // Array of vibrant colors (our preferred palette)
  const colorPalette = useMemo(() => [
    "#38B2AC", // Teal
    "#9F7AEA", // Purple
    "#F6AD55", // Orange
    "#68D391", // Green
    "#F687B3", // Pink
    "#4FD1C5", // Teal-400
    "#B794F4", // Purple-300
    "#7F9CF5", // Indigo-400
    "#C6F6D5", // Green-200
    "#FBD38D", // Orange-300
    "#76E4F7", // Cyan-300
    "#E9D8FD", // Purple-200
    "#90CDF4", // Blue-300
    "#FEB2B2", // Red-300
    "#81E6D9", // Teal-300
    "#D6BCFA", // Purple-300
    "#FBB6CE", // Pink-300
    "#B2F5EA", // Teal-200
    "#667EEA", // Indigo-600
    "#ED64A6", // Pink-500
    "#48BB78", // Green-500
    "#ECC94B", // Yellow-400
    "#4299E1", // Blue-500
    "#ED8936", // Orange-500
    "#9F7AEA", // Purple-500
    "#F56565", // Red-500
    "#38A169", // Green-600
    "#D69E2E", // Yellow-500
    "#3182CE", // Blue-600
    "#DD6B20", // Orange-600
    "#805AD5", // Purple-600
    "#E53E3E", // Red-600
    "#2F855A", // Green-700
    "#B7791F", // Yellow-600
    "#2B6CB0", // Blue-700
    "#C05621", // Orange-700
    "#6B46C1", // Purple-700
    "#C53030", // Red-700
    "#276749", // Green-800
    "#744210", // Yellow-700
    "#2C5282", // Blue-800
    "#9C4221", // Orange-800
    "#553C9A", // Purple-800
    "#9B2C2C", // Red-800
    "#22543D", // Green-900
    "#5F370E", // Yellow-800
    "#2A4365", // Blue-900
    "#7B341E", // Orange-900
    "#44337A", // Purple-900
    "#822727"  // Red-900
  ], []);

  // Add array to store custom colors for groups
  const [groupColors, setGroupColors] = useState<Record<number, string>>({});
  
  // Initialize group colors with our preferred palette when headGroups changes
  useEffect(() => {
    // Only assign initial colors if we haven't assigned any yet
    if (Object.keys(groupColors).length === 0 && headGroups.length > 0) {
      const initialColors: Record<number, string> = {};
      
      headGroups.forEach((group, index) => {
        initialColors[group.id] = colorPalette[index % colorPalette.length];
      });
      
      setGroupColors(initialColors);
    }
  }, [headGroups, groupColors, colorPalette]);

  // Function to get a random color that isn't already in use
  const getRandomColor = useCallback(() => {
    // Get all colors currently in use
    const usedColors = Object.values(groupColors);
    
    // Filter out colors that are already in use
    const availableOptions = colorPalette.filter(color => !usedColors.includes(color));
    
    // If no available colors, use a random one from our palette
    if (availableOptions.length === 0) {
      return colorPalette[Math.floor(Math.random() * colorPalette.length)];
    }
    
    // Pick a random color from the available options
    const randomIndex = Math.floor(Math.random() * availableOptions.length);
    return availableOptions[randomIndex];
  }, [groupColors, colorPalette]);

  // Function to change a group's color
  const changeGroupColor = useCallback((groupId: number) => {
    const newColor = getRandomColor();
    setGroupColors(prev => ({
      ...prev,
      [groupId]: newColor
    }));
  }, [getRandomColor]);

  // Function to get color for a group, using custom color if available
  const getGroupColor = useCallback((groupId: number) => {
    if (groupColors[groupId]) {
      return groupColors[groupId];
    }
    return colorPalette[groupId % colorPalette.length];
  }, [groupColors, colorPalette]);

  // Add a utility for debounced redrawing
  const useDebounce = (fn: () => void, delay: number) => {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        fn();
        timeoutRef.current = null;
      }, delay);
    };
  };

  // Add color scale for groups
  const groupColorScale = useMemo(() => {
    const groups = [...predefinedGroups, ...headGroups];
    return d3.scaleOrdinal<string>()
      .domain(groups.map(g => g.name))
      .range(d3.schemeCategory10);
  }, [predefinedGroups, headGroups]);

  // Memoize drawGraph to prevent infinite loops
  const drawGraph = React.useCallback(() => {
    if (!svgRef.current) return;
    
    // Use a more performant approach with D3
    const svg = d3.select(svgRef.current);
    
    // Clear only if needed - don't do this on every render
    svg.selectAll("*").remove();
    
    // Set viewBox for better responsiveness
    svg.attr("viewBox", `0 0 ${graphDimensions.width} ${graphDimensions.height}`);
    
    const width = graphDimensions.width;
    const height = graphDimensions.height;
    const padding = graphDimensions.padding;
    const legendWidth = padding.right; // Width for the legend
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    const tokenWidth = graphWidth / data.numTokens;
    const layerHeight = graphHeight / (data.numLayers - 1); // Increased spacing between layers
    
    // Create nodes
    const nodes: Node[] = [];
    for (let l = 0; l < data.numLayers; l++) {
      for (let t = 0; t < data.numTokens; t++) {
        nodes.push({
          id: `${l}-${t}`,
          layer: l,
          token: t,
          x: padding.left + t * tokenWidth + tokenWidth / 2,
          y: height - (padding.bottom + l * layerHeight), // Adjusted y-coordinate calculation
        });
      }
    }
    
    // Create color scales for individual heads
    const individualHeadColorScale = d3.scaleOrdinal(colorPalette)
      .domain(Array.from({length: data.numHeads}, (_, i) => i.toString()));
    
    // Filter edges based on threshold and visible heads
    const visibleHeadPairs = getVisibleHeads();
    const links: Link[] = data.attentionPatterns
      .filter(edge => {
        const isVisible = visibleHeadPairs.some(h => 
          h.layer === edge.sourceLayer && h.head === edge.head
        );
        return edge.weight >= threshold && isVisible;
      })
      .map(edge => ({
        source: `${edge.sourceLayer}-${edge.sourceToken}`,
        target: `${edge.destLayer}-${edge.destToken}`,
        weight: edge.weight,
        head: edge.head,
        groupId: getHeadGroup(edge.sourceLayer, edge.head) ?? -1
      }));
    
    // Use a single container for better performance
    const g = svg.append("g").attr("class", "graph-container");
    
    // First add all static elements

    // Layer labels (now on y-axis)
    g.selectAll(".layer-label")
      .data(Array(data.numLayers).fill(0).map((_, i) => i))
      .enter()
      .append("text")
      .attr("class", "layer-label")
      .attr("x", padding.left / 2 + 25)
      .attr("y", d => height - (padding.bottom + d * layerHeight))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(d => d.toString());
    
    // Y-axis label (Layers)
    g.append("text")
      .attr("x", padding.left / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "medium")
      .text("Layer");
    
    // Token labels (now on x-axis)
    g.selectAll(".token-label")
      .data(Array(data.numTokens).fill(0).map((_, i) => i))
      .enter()
      .append("text")
      .attr("class", "token-label")
      .attr("x", d => padding.left + d * tokenWidth + tokenWidth / 2)
      .attr("y", height - padding.bottom / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(d => data.tokens?.[d] || `T${d}`);

    // X-axis label (Tokens)
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height - padding.bottom / 4)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "medium")
      .text("Token");
    
    // Create link paths in a more efficient way
    const linkContainer = g.append("g").attr("class", "links");
    
    // Path generator function
    const pathGenerator = (d: Link) => {
      const source = nodes.find(n => n.id === d.source)!;
      const target = nodes.find(n => n.id === d.target)!;
      
      const dx = target.x - source.x;
      const controlPoint1x = source.x + dx * 0.5;
      const controlPoint1y = source.y;
      const controlPoint2x = target.x - dx * 0.5;
      const controlPoint2y = target.y;
      
      return `M ${source.x} ${source.y} C ${controlPoint1x} ${controlPoint1y}, ${controlPoint2x} ${controlPoint2y}, ${target.x} ${target.y}`;
    };
    
    // Add links in a batch for better performance
    const linkElements = linkContainer.selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", pathGenerator)
      .attr("fill", "none")
      .attr("stroke", d => d.groupId === -1 ? individualHeadColorScale(d.head.toString()) : getGroupColor(d.groupId))
      .attr("stroke-width", 4)
      .attr("opacity", 0.6)
      .attr("data-source", d => d.source)
      .attr("data-target", d => d.target)
      .style("cursor", "pointer")
      .on("mouseover", function(this: SVGPathElement, d: Link) {
        // Highlight the hovered link
        d3.select(this)
          .attr("opacity", 1)
          .attr("stroke-width", 6);

        // If the link belongs to a group, highlight all links in that group
        if (d.groupId !== -1) {
          linkContainer.selectAll("path")
            .filter(function(l) {
              return (l as Link).groupId === d.groupId;
            })
            .attr("opacity", 0.8)
            .attr("stroke-width", 5);

          // Also highlight the nodes connected to this group's links
          const groupLinks = links.filter((l: Link) => l.groupId === d.groupId);
          const groupNodeIds = new Set([
            ...groupLinks.map((l: Link) => l.source),
            ...groupLinks.map((l: Link) => l.target)
          ]);

          nodeContainer.selectAll("circle")
            .filter(function(n) {
              return groupNodeIds.has((n as Node).id);
            })
            .attr("fill", "#d1d5db")
            .attr("r", 8);

          // Highlight the corresponding group in the legend
          legendContainer.selectAll(".legend-item")
            .filter(function() {
              const text = d3.select(this).select("text").text();
              const group = headGroups.find(g => g.id === d.groupId);
              return group ? text === group.name : false;
            })
            .select("text")
            .attr("font-weight", "bold")
            .attr("fill", "#3B82F6");
        } else {
          // For individual heads, highlight the corresponding head in the legend
          legendContainer.selectAll(".legend-item")
            .filter(function() {
              const text = d3.select(this).select("text").text();
              return text === `L${d.source.split('-')[0]}, H${d.head}`;
            })
            .select("text")
            .attr("font-weight", "bold")
            .attr("fill", "#3B82F6");
        }
      })
      .on("mouseout", function(this: SVGPathElement, d: Link) {
        // Reset the hovered link
        d3.select(this)
          .attr("opacity", 0.6)
          .attr("stroke-width", 4);

        // If the link belonged to a group, reset all links in that group
        if (d.groupId !== -1) {
          linkContainer.selectAll("path")
            .filter(function(l) {
              return (l as Link).groupId === d.groupId;
            })
            .attr("opacity", 0.6)
            .attr("stroke-width", 4);

          // Reset the nodes
          const groupLinks = links.filter((l: Link) => l.groupId === d.groupId);
          const groupNodeIds = new Set([
            ...groupLinks.map((l: Link) => l.source),
            ...groupLinks.map((l: Link) => l.target)
          ]);

          nodeContainer.selectAll("circle")
            .filter(function(n) {
              return groupNodeIds.has((n as Node).id);
            })
            .attr("fill", "#e5e7eb")
            .attr("r", 6);

          // Reset the corresponding group in the legend
          legendContainer.selectAll(".legend-item")
            .filter(function() {
              const text = d3.select(this).select("text").text();
              const group = headGroups.find(g => g.id === d.groupId);
              return group ? text === group.name : false;
            })
            .select("text")
            .attr("font-weight", "normal")
            .attr("fill", "currentColor");
        } else {
          // Reset the corresponding head in the legend
          legendContainer.selectAll(".legend-item")
            .filter(function() {
              const text = d3.select(this).select("text").text();
              return text === `L${d.source.split('-')[0]}, H${d.head}`;
            })
            .select("text")
            .attr("font-weight", "normal")
            .attr("fill", "currentColor");
        }
      });

    // Add nodes in a batch
    const nodeContainer = g.append("g").attr("class", "nodes");
    
    const nodeElements = nodeContainer.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("class", "node")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 6)
      .attr("fill", "#e5e7eb")
      .attr("data-node-id", d => d.id)
      .style("cursor", "pointer")
      .on("mouseover", function() {
        d3.select(this)
          .attr("r", 8)
          .attr("fill", "#d1d5db");
      })
      .on("mouseout", function() {
        d3.select(this)
          .attr("r", 6)
          .attr("fill", "#e5e7eb");
      });

    // Add legend
    const legendContainer = g.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width - legendWidth + 20}, ${padding.top + 20})`);
    
    // Legend title
    legendContainer.append("text")
      .attr("x", 0)
      .attr("y", 0)
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Legend");
    
    // Group legends - show first
    let legendY = 30;
    if (headGroups.length > 0) {
      legendContainer.append("text")
        .attr("x", 0)
        .attr("y", legendY)
        .attr("font-size", "12px")
        .attr("font-weight", "medium")
        .text("Head Groups");
      
      legendY += 20;
      
      headGroups.forEach((group, i) => {
        // Skip empty groups
        if (group.heads.length === 0) return;
        
        // Create a group for each legend item
        const legendItem = legendContainer.append("g")
          .attr("class", "legend-item")
          .attr("cursor", "pointer")
          .on("click", () => changeGroupColor(group.id));
        
        // Line
        legendItem.append("line")
          .attr("x1", 0)
          .attr("y1", legendY)
          .attr("x2", 30)
          .attr("y2", legendY)
          .attr("stroke", getGroupColor(group.id))
          .attr("stroke-width", 4)
          .attr("opacity", 0.8);
        
        // Text
        const textElement = legendItem.append("text")
          .attr("x", 40)
          .attr("y", legendY + 4)
          .attr("font-size", "12px")
          .text(group.name)
          .on("mouseover", function() {
            // Highlight all links in this group
            linkContainer.selectAll("path")
              .filter(function(l) {
                return (l as Link).groupId === group.id;
              })
              .attr("opacity", 0.8)
              .attr("stroke-width", 5);

            // Highlight connected nodes
            const groupLinks = links.filter((l: Link) => l.groupId === group.id);
            const groupNodeIds = new Set([
              ...groupLinks.map((l: Link) => l.source),
              ...groupLinks.map((l: Link) => l.target)
            ]);

            nodeContainer.selectAll("circle")
              .filter(function(n) {
                return groupNodeIds.has((n as Node).id);
              })
              .attr("fill", "#d1d5db")
              .attr("r", 8);

            // Highlight the legend text
            d3.select(this)
              .attr("font-weight", "bold")
              .attr("fill", "#3B82F6");
          })
          .on("mouseout", function() {
            // Reset all links in this group
            linkContainer.selectAll("path")
              .filter(function(l) {
                return (l as Link).groupId === group.id;
              })
              .attr("opacity", 0.6)
              .attr("stroke-width", 4);

            // Reset connected nodes
            const groupLinks = links.filter((l: Link) => l.groupId === group.id);
            const groupNodeIds = new Set([
              ...groupLinks.map((l: Link) => l.source),
              ...groupLinks.map((l: Link) => l.target)
            ]);

            nodeContainer.selectAll("circle")
              .filter(function(n) {
                return groupNodeIds.has((n as Node).id);
              })
              .attr("fill", "#e5e7eb")
              .attr("r", 6);

            // Reset the legend text
            d3.select(this)
              .attr("font-weight", "normal")
              .attr("fill", "currentColor");
          });
        
        legendY += 20;
      });
      
      // Add some space before individual heads
      legendY += 10;
    }
    
    // Individual heads section
    const individualHeads = selectedHeads.filter(h => 
      !headGroups.some(g => g.heads.some(gh => gh.layer === h.layer && gh.head === h.head))
    );
    
    if (individualHeads.length > 0) {
      legendContainer.append("text")
        .attr("x", 0)
        .attr("y", legendY)
        .attr("font-size", "12px")
        .attr("font-weight", "medium")
        .text("Individual Heads");
      
      legendY += 20;
      
      individualHeads.forEach(head => {
        // Create a group for each individual head legend item
        const legendItem = legendContainer.append("g")
          .attr("class", "legend-item")
          .attr("cursor", "pointer");
        
        // Line 
        legendItem.append("line")
          .attr("x1", 0)
          .attr("y1", legendY)
          .attr("x2", 30)
          .attr("y2", legendY)
          .attr("stroke", individualHeadColorScale(head.head.toString()))
          .attr("stroke-width", 4)
          .attr("opacity", 0.8);
        
        // Text
        legendItem.append("text")
          .attr("x", 40)
          .attr("y", legendY + 4)
          .attr("font-size", "12px")
          .text(`L${head.layer}, H${head.head}`)
          .on("mouseover", function() {
            // Highlight all links for this head
            linkContainer.selectAll("path")
              .filter(function(l) {
                return (l as Link).head === head.head && (l as Link).groupId === -1;
              })
              .attr("opacity", 0.8)
              .attr("stroke-width", 5);

            // Highlight connected nodes
            const headLinks = links.filter((l: Link) => l.head === head.head && l.groupId === -1);
            const headNodeIds = new Set([
              ...headLinks.map((l: Link) => l.source),
              ...headLinks.map((l: Link) => l.target)
            ]);

            nodeContainer.selectAll("circle")
              .filter(function(n) {
                return headNodeIds.has((n as Node).id);
              })
              .attr("fill", "#d1d5db")
              .attr("r", 8);

            // Highlight the legend text
            d3.select(this)
              .attr("font-weight", "bold")
              .attr("fill", "#3B82F6");
          })
          .on("mouseout", function() {
            // Reset all links for this head
            linkContainer.selectAll("path")
              .filter(function(l) {
                return (l as Link).head === head.head && (l as Link).groupId === -1;
              })
              .attr("opacity", 0.6)
              .attr("stroke-width", 4);

            // Reset connected nodes
            const headLinks = links.filter((l: Link) => l.head === head.head && l.groupId === -1);
            const headNodeIds = new Set([
              ...headLinks.map((l: Link) => l.source),
              ...headLinks.map((l: Link) => l.target)
            ]);

            nodeContainer.selectAll("circle")
              .filter(function(n) {
                return headNodeIds.has((n as Node).id);
              })
              .attr("fill", "#e5e7eb")
              .attr("r", 6);

            // Reset the legend text
            d3.select(this)
              .attr("font-weight", "normal")
              .attr("fill", "currentColor");
          });
        
        legendY += 20;
      });
    }
  }, [
    data, 
    threshold, 
    selectedHeads, 
    headGroups,
    getGroupColor,
    getVisibleHeads,
    changeGroupColor,
    colorPalette,
    getHeadGroup,
    graphDimensions.height, 
    graphDimensions.width, 
    graphDimensions.padding
  ]);

  // Create a debounced version of the drawGraph function
  const debouncedDrawGraph = useDebounce(drawGraph, 100);

  // Draw the graph whenever relevant state changes
  useEffect(() => {
    // Only draw the graph if we have attention patterns data and no errors
    if (!data.attentionPatterns.length || loading) return;
    
    // Use the debounced version for smoother performance
    debouncedDrawGraph();
  }, [data, threshold, selectedHeads, headGroups, debouncedDrawGraph, loading]);

  // Add function to handle clicks outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Element)) {
        setOpenDropdownId(null);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update the forceProcessText function to make it clearer that it's the only way to process text
  const forceProcessText = () => {
    console.log("Processing text via button click:", inputText);
    if (inputText.trim().length > 0) {
      fetchAttentionData(inputText);
    }
  };

  // Add a component mount effect for initial processing - keep this to ensure proper initialization
  useEffect(() => {
    // Initialize with default text for the current model
    const defaultText = getDefaultTextForModel(currentModel);
    setInputText(defaultText);
    
    // Process the default text if backend is available and we haven't processed any text yet
    if (backendAvailable && defaultText && lastProcessedText === "") {
      console.log("Processing default text on component mount:", defaultText);
      // Use a small delay to ensure state has updated
      setTimeout(() => {
        fetchAttentionData(defaultText);
      }, 100);
    }
  }, [backendAvailable, currentModel, getDefaultTextForModel, lastProcessedText, fetchAttentionData]);

  return (
    <>
      <style jsx>{`
        ${sliderStyles}
        ${svgOptimizationStyles}
      `}</style>
      {/* Tooltip container that will be populated by D3 */}
      <div id="graph-tooltip" style={{ display: 'none', position: 'absolute', zIndex: 1000 }}></div>
      <div className="flex flex-col gap-6 p-4 max-w-[1200px] mx-auto">
        <div className="flex justify-between items-start gap-6">
          <div className="flex-1">
            <h2 className="text-white text-2xl font-medium-bold mb-4">Attention Flow Graph</h2>
            
            {backendAvailable === null ? (
              <div className="text-[#3B82F6] text-sm">Checking backend availability...</div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Model Selector - Custom implementation */}
                <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <label className="text-sm font-medium mb-2 block">Model</label>
                  
                  {/* Custom dropdown */}
                  <div className="relative" ref={modelDropdownRef}>
                    <button
                      type="button"
                      className="w-full p-2 text-sm bg-white border border-gray-200 rounded-md focus:border-[#3B82F6] focus:outline-none shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-left flex justify-between items-center"
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    >
                      <span>{currentModel}</span>
                      <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {isModelDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                        <ul className="py-1 max-h-60 overflow-auto">
                          {availableModels.map((model) => (
                            <li
                              key={model}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${model === currentModel ? 'font-semibold bg-blue-50' : ''}`}
                              onClick={() => handleModelChange(model)}
                            >
                              {model}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-600 mt-2">
                    Predefined head groups are specific to the selected model.
                  </div>
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                    <p className="font-medium">Model Loading:</p>
                    <p>When you select a model that isn't currently loaded, the backend will attempt to load it. Please be patient as this may take some time, especially for larger models like Pythia.</p>
                    {loading && currentModel !== lastProcessedModel && <p className="mt-1 font-medium text-blue-600">Loading model data... Please wait.</p>}
                  </div>
                </div>
                
                {/* Controls Section */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Head Groups */}
                  <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <label className="text-sm font-medium mb-3 block">Head Groups</label>
                    
                    {/* Add new group form */}
                    <div className="mb-3 pb-3 border-b border-gray-100">
                      <form onSubmit={createNewGroup}>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 text-xs font-mono bg-white border-b border-gray-200 focus:border-[#3B82F6] focus:outline-none transition-colors rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                            placeholder="New group name"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                          />
                          <button
                            type="submit"
                            className="px-3 py-2 bg-[#3B82F6] text-white rounded-md text-xs hover:bg-[#2563EB] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
                          >
                            Create
                          </button>
                        </div>
                        {groupError && (
                          <div className="text-xs text-red-500 mt-1">{groupError}</div>
                        )}
                        <div className="text-xs text-gray-600 mt-1">
                          Create a new group to organize attention heads
                        </div>
                      </form>
                    </div>
                    
                    <div className="space-y-3 max-h-[200px] overflow-y-auto">
                      {headGroups.map(group => {
                        // For predefined groups, use the predefined vertices
                        const predefinedGroup = predefinedGroups.find(g => g.name === group.name);
                        
                        return (
                          <div key={group.id} className="p-3 border border-gray-100 rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                            <div className="font-medium text-sm mb-2">{group.name}</div>
                            {group.description && (
                              <div className="text-xs text-gray-600 mb-2">{group.description}</div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {predefinedGroup ? (
                                // For predefined groups, show all possible vertices
                                predefinedGroup.vertices.map(([layer, head]) => (
                                  <button
                                    key={`${layer}-${head}`}
                                    onClick={() => addHeadToGroup(layer, head, group.id)}
                                    className="px-2 py-0.5 rounded-md text-xs transition-colors duration-200"
                                    style={{
                                      backgroundColor: group.heads.some(h => h.layer === layer && h.head === head)
                                        ? getGroupColor(group.id)
                                        : '#f3f4f6',
                                      color: group.heads.some(h => h.layer === layer && h.head === head)
                                        ? 'white'
                                        : '#374151'
                                    }}
                                  >
                                    {layer},{head}
                                  </button>
                                ))
                              ) : (
                                // For custom groups, just show the added heads
                                group.heads.length > 0 ? (
                                  group.heads.map(({layer, head}) => (
                                    <button
                                      key={`${layer}-${head}`}
                                      onClick={() => removeHead(layer, head, group.id)}
                                      className="px-2 py-0.5 rounded-md text-white text-xs hover:opacity-80"
                                      style={{
                                        backgroundColor: getGroupColor(group.id)
                                      }}
                                    >
                                      {layer},{head}
                                    </button>
                                  ))
                                ) : (
                                  <div className="text-xs text-gray-500 italic">
                                    Add heads from the &quot;Individual Heads&quot; section
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Individual Heads */}
                  <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <label className="text-sm font-medium mb-3 block">Individual Heads</label>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-gray-600 mb-2">Selected heads:</div>
                        <div className="flex flex-wrap gap-1.5 min-h-[28px] p-3 bg-white rounded-lg border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                          {selectedHeads.map(({ layer, head }) => {
                            const headId = `${layer}-${head}`;
                            return (
                              <div key={headId} className="relative">
                                <div className="flex">
                                  <button
                                    onClick={() => removeHead(layer, head)}
                                    className="px-2 py-0.5 rounded-l-md text-white text-xs hover:opacity-80"
                                    style={{
                                      backgroundColor: colorPalette[head % colorPalette.length]
                                    }}
                                  >
                                    {layer},{head}
                                  </button>
                                  {headGroups.length > 0 && (
                                    <button
                                      className="px-1 py-0.5 rounded-r-md text-white text-xs hover:bg-black/20"
                                      style={{
                                        backgroundColor: colorPalette[head % colorPalette.length]
                                      }}
                                      title="Add to group"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdownId(openDropdownId === headId ? null : headId);
                                      }}
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                                
                                {/* Dropdown for groups */}
                                {openDropdownId === headId && (
                                  <div 
                                    ref={dropdownRef}
                                    className="absolute right-0 top-full mt-1 bg-white shadow-md rounded-md border border-gray-100 z-10 w-48"
                                  >
                                    <div className="py-1 max-h-[150px] overflow-y-auto">
                                      {headGroups.map(group => (
                                        <button
                                          key={group.id}
                                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 truncate"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            addHeadToGroup(layer, head, group.id);
                                            removeHead(layer, head);
                                            setOpenDropdownId(null);
                                          }}
                                        >
                                          {group.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {selectedHeads.length === 0 && (
                            <div className="text-xs text-gray-500 italic px-1">
                              No heads selected
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <div className="text-xs text-gray-600 italic w-full">
                            ↑ Click + to add a head to a group
                          </div>
                        </div>
                      </div>

                      <div>
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                          handleHeadSelection(input.value);
                          input.value = '';
                        }}>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="flex-1 px-3 py-2 text-xs font-mono bg-white border-b border-gray-200 focus:border-[#3B82F6] focus:outline-none transition-colors rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                              placeholder="layer,head or layer,: or :,head or :,:"
                            />
                            <button
                              type="submit"
                              className="px-3 py-2 bg-[#3B82F6] text-white rounded-md text-xs hover:bg-[#2563EB] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
                            >
                              Add
                            </button>
                          </div>
                        </form>
                        {headError && (
                          <div className="text-xs text-red-500 mt-2">{headError}</div>
                        )}
                        <div className="text-xs text-gray-600 mt-2">
                          Valid: Layer (0-{data.numLayers - 1}), Head (0-{data.numHeads - 1})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Threshold Control - More compact design */}
                <div className="p-3 border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium flex-shrink-0">Edge Weight:</label>
                    <span className="text-xs font-mono w-10 text-right bg-transparent border-b border-gray-100 px-1 flex-shrink-0">
                      {threshold.toFixed(2)}
                    </span>
                    <div className="custom-range-wrapper flex-1">
                      <div className="custom-range-track" style={{ width: `${threshold * 100}%` }}></div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={threshold} 
                        onChange={handleThresholdChange}
                        className="custom-range relative z-10" 
                      />
                    </div>
                  </div>
                </div>

                {/* Text Input Section */}
                {backendAvailable && (
                  <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="flex flex-col space-y-4">
                      {/* Text Input - Model selector removed from here */}
                      <div>
                        <label className="text-sm font-medium mb-2 block">Input Text</label>
                        <textarea
                          ref={textareaRef}
                          className="w-full p-3 text-sm bg-[#F3F4F6] border-0 border-b border-transparent focus:border-[#3B82F6] focus:bg-white focus:outline-none transition-all duration-200 ease-in-out disabled:bg-gray-100 disabled:border-transparent disabled:cursor-not-allowed resize-none rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                          rows={2}
                          placeholder="Enter text here, then click 'Process Text' to analyze attention patterns..."
                          onChange={handleTextChange}
                          disabled={loading || !backendAvailable}
                          value={inputText}
                        />
                        <div className="flex items-center justify-between mt-2">
                          {loading && (
                            <div className="text-xs text-[#3B82F6]">Loading attention patterns...</div>
                          )}
                          {textError && (
                            <div className="text-xs text-red-500">{textError}</div>
                          )}
                          <button
                            onClick={forceProcessText}
                            className="ml-auto px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm flex items-center"
                            disabled={loading || !inputText}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Process Text
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!backendAvailable && (
                  <div className="p-4 border border-gray-100 rounded-lg bg-yellow-50/80 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <p className="text-yellow-800">
                      Backend is not available. Showing sample attention patterns. Text input is disabled - you can explore the sample data using the controls above, but cannot analyze new text until the backend becomes available.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Graph Section */}
        {loading ? (
          <div className="flex justify-center items-center h-[700px] border border-gray-100 rounded-lg bg-gray-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-sm">Loading...</div>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-lg bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)] svg-container">
            <svg ref={svgRef} width={graphDimensions.width} height={graphDimensions.height}></svg>
          </div>
        )}
      </div>
    </>
  );
};

export default AttentionFlowGraph;
