"use client";

import React, { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import sampleAttentionData from '../data/sample-attention.json';

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

interface AttentionPattern {
  sourceLayer: number;
  sourceToken: number;
  destLayer: number;
  destToken: number;
  weight: number;
  head: number;
} 

interface HeadPair {
  layer: number;
  head: number;
}

interface HeadGroup {
  id: number;
  name: string;
  heads: HeadPair[];
}

interface GraphData {
  numLayers: number;
  numTokens: number;
  numHeads: number;
  attentionPatterns: AttentionPattern[];
  tokens?: string[];  // Optional array of actual tokens
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
  
  // Wrap predefinedGroups in useMemo
  const predefinedGroups = useMemo<PredefinedGroup[]>(() => [
    {
      name: "Name Mover",
      vertices: [[9, 9], [10, 0], [9, 6]]
    },
    {
      name: "Negative",
      vertices: [[10, 7], [11, 10]]
    },
    {
      name: "S Inhibition",
      vertices: [[8, 10], [7, 9], [8, 6], [7, 3]]
    },
    {
      name: "Induction",
      vertices: [[5, 5], [5, 9], [6, 9], [5, 8]]
    },
    {
      name: "Duplicate Token",
      vertices: [[0, 1], [0, 10], [3, 0]]
    },
    {
      name: "Previous Token",
      vertices: [[4, 11], [2, 2]]
    },
    {
      name: "Backup Name Mover",
      vertices: [[11, 2], [10, 6], [10, 10], [10, 2], [9, 7], [10, 1], [11, 9], [9, 0]]
    }
  ], []);
  
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
    try {
      setTextError(null);
      setLoading(true);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch attention data');
      }

      const data = await response.json();
      setData(data);
      
      // Restore focus to textarea after data is loaded
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (error) {
      console.error('Error fetching attention data:', error);
      setTextError(error instanceof Error ? error.message : 'Failed to fetch attention data');
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchAttentionData = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout | null = null;
      return (text: string) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          if (text.trim()) {
            fetchAttentionData(text);
          }
          timeoutId = null;
        }, 500); // 500ms debounce delay
      };
    })(),
    [fetchAttentionData]
  );

  // Initialize predefined head groups
  useEffect(() => {
    const initialGroups = predefinedGroups.map((group, index) => ({
      id: index,
      name: group.name,
      heads: group.vertices.map(([layer, head]) => ({ layer, head }))
    }));

    setHeadGroups(initialGroups);
  }, [predefinedGroups]);

  // Check if backend is available on component mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/health`);
        setBackendAvailable(response.ok);
      } catch (error) {
        console.warn('Backend not available:', error);
        setBackendAvailable(false);
      }
    };
    checkBackend();
  }, []);

  // Load appropriate data based on backend availability
  useEffect(() => {
    if (backendAvailable === false) {
      setData(sampleAttentionData);
      setSelectedHeads([{ layer: 0, head: 0 }]);
    } else if (backendAvailable === true) {
      const defaultText = "When Mary and John went to the store, John gave a drink to";
      fetchAttentionData(defaultText);
    }
  }, [backendAvailable, fetchAttentionData]);

  useEffect(() => {
    const trackElement = document.querySelector('.custom-range-track') as HTMLDivElement;
    if (trackElement) {
      const percentage = threshold * 100;
      trackElement.style.width = `${percentage}%`;
    }
  }, [threshold]);

  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setThreshold(value);
    
    // Update track width
    const trackElement = document.querySelector('.custom-range-track') as HTMLDivElement;
    if (trackElement) {
      const percentage = value * 100;
      trackElement.style.width = `${percentage}%`;
    }
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
    "#3B82F6", // Blue
    "#EF4444", // Red
    "#10B981", // Green
    "#F59E0B", // Amber
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#F97316", // Orange
    "#14B8A6", // Teal
    "#6366F1", // Indigo
    "#84CC16", // Lime
    "#A855F7", // Purple-500
    "#D946EF", // Fuchsia
    "#22D3EE", // Cyan-400
    "#2DD4BF", // Teal-400
    "#4ADE80", // Green-400
    "#FB7185", // Rose-400
    "#C084FC", // Purple-400
    "#34D399", // Emerald-400
    "#F472B6"  // Pink-400
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

  // Memoize drawGraph to prevent infinite loops
  const drawGraph = React.useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
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
    
    // Draw layers and tokens labels
    const g = svg.append("g");
    
    // Layer labels (now on y-axis)
    for (let l = 0; l < data.numLayers; l++) {
      g.append("text")
        .attr("x", padding.left / 2 + 25)  // Increased from 15 to 25
        .attr("y", height - (padding.bottom + l * layerHeight))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(l.toString());
    }
    
    // Y-axis label (Layers)
    g.append("text")
      .attr("x", padding.left / 2)  // Moved from -25 to center position
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "medium")
      .text("Layer");
    
    // Token labels (now on x-axis)
    for (let t = 0; t < data.numTokens; t++) {
      g.append("text")
        .attr("x", padding.left + t * tokenWidth + tokenWidth / 2)
        .attr("y", height - padding.bottom / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(data.tokens?.[t] || `T${t}`);  // Use actual token if available
    }

    // X-axis label (Tokens)
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height - padding.bottom / 4)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "medium")
      .text("Token");
    
    // Draw edges first (so they're behind nodes)
    const linkElements = g.selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("d", (d: Link) => {
        const source = nodes.find(n => n.id === d.source)!;
        const target = nodes.find(n => n.id === d.target)!;
        
        // Calculate control points for the curve
        const dx = target.x - source.x;
        const controlPoint1x = source.x + dx * 0.5;
        const controlPoint1y = source.y;
        const controlPoint2x = target.x - dx * 0.5;
        const controlPoint2y = target.y;
        
        // Create a curved path using cubic Bezier curve
        return `M ${source.x} ${source.y} ` +
               `C ${controlPoint1x} ${controlPoint1y}, ` +
               `${controlPoint2x} ${controlPoint2y}, ` +
               `${target.x} ${target.y}`;
      })
      .attr("fill", "none")
      .attr("stroke", (d: Link) => {
        if (d.groupId === -1) {
          return individualHeadColorScale(d.head.toString());
        }
        return getGroupColor(d.groupId);
      })
      .attr("stroke-width", 4)
      .attr("opacity", 0.6)
      .attr("data-source", (d: Link) => d.source)
      .attr("data-target", (d: Link) => d.target)
      .style("cursor", "pointer")
      .on("mouseover", function(this: SVGPathElement) {
        d3.select(this)
          .attr("opacity", 1)
          .attr("stroke-width", 6);
      })
      .on("mouseout", function(this: SVGPathElement) {
        d3.select(this)
          .attr("opacity", 0.9)
          .attr("stroke-width", 4);
      }); 
    
    // Draw nodes
    const nodeElements = g.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("cx", (d: Node) => d.x)
      .attr("cy", (d: Node) => d.y)
      .attr("r", 6) // Decreased radius
      .attr("fill", "#e5e7eb")
      .attr("data-node-id", (d: Node) => d.id)
      .style("cursor", "pointer")
      .on("mouseover", function() {
        d3.select(this)
          .attr("r", 8) // Decreased hover radius
          .attr("fill", "#d1d5db");
      })
      .on("mouseout", function() {
        d3.select(this)
          .attr("r", 6)
          .attr("fill", "#e5e7eb");
      });

    // Add invisible larger circles for easier hovering
    g.selectAll("circle.hover-target")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("class", "hover-target")
      .attr("cx", (d: Node) => d.x)
      .attr("cy", (d: Node) => d.y)
      .attr("r", 12) // Decreased hover target radius
      .attr("fill", "transparent")
      .attr("data-node-id", (d: Node) => d.id)
      .style("cursor", "pointer")
      .on("mouseover", function(event: MouseEvent, d: Node) {
        // Show tooltip
        const tooltipDiv = d3.select<HTMLDivElement, unknown>("#graph-tooltip");
        tooltipDiv
          .style("display", "block")
          .style("position", "absolute")
          .style("background", "white")
          .style("padding", "5px")
          .style("border", "1px solid #ccc")
          .style("border-radius", "4px")
          .style("font-size", "12px")
          .style("pointer-events", "none")
          .html(`Layer ${d.layer}, Token ${d.token}`);

        // Position tooltip
        tooltipDiv
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 10) + "px");

        // Highlight node
        const parent = this.parentElement;
        if (parent) {
          d3.select(parent)
            .select(`circle[data-node-id="${d.id}"]:not(.hover-target)`)
            .attr("r", 8)
            .attr("fill", "#d1d5db");
        }
      })
      .on("mouseout", function(event: MouseEvent, d: Node) {
        // Hide tooltip
        d3.select<HTMLDivElement, unknown>("#graph-tooltip").style("display", "none");

        // Reset node
        const parent = this.parentElement;
        if (parent) {
          d3.select(parent)
            .select(`circle[data-node-id="${d.id}"]:not(.hover-target)`)
            .attr("r", 6)
            .attr("fill", "#e5e7eb");
        }
      });

    // Update the invisible hover targets for edges
    g.selectAll<SVGPathElement, Link>("path.hover-target")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "hover-target")
      .attr("d", (d: Link) => {
        const source = nodes.find(n => n.id === d.source)!;
        const target = nodes.find(n => n.id === d.target)!;
        
        // Calculate control points for the curve
        const dx = target.x - source.x;
        const controlPoint1x = source.x + dx * 0.5;
        const controlPoint1y = source.y;
        const controlPoint2x = target.x - dx * 0.5;
        const controlPoint2y = target.y;
        
        // Create a curved path using cubic Bezier curve
        return `M ${source.x} ${source.y} ` +
               `C ${controlPoint1x} ${controlPoint1y}, ` +
               `${controlPoint2x} ${controlPoint2y}, ` +
               `${target.x} ${target.y}`;
      })
      .attr("stroke", "transparent")
      .attr("fill", "none")
      .attr("stroke-width", 20)
      .attr("data-source", (d: Link) => d.source)
      .attr("data-target", (d: Link) => d.target)
      .style("cursor", "pointer")
      .on("mouseover", function(event: MouseEvent, d: Link) {
        // Show tooltip
        const tooltipDiv = d3.select<HTMLDivElement, unknown>("#graph-tooltip");
        tooltipDiv
          .style("display", "block")
          .style("position", "absolute")
          .style("background", "white")
          .style("padding", "5px")
          .style("border", "1px solid #ccc")
          .style("border-radius", "4px")
          .style("font-size", "12px")
          .style("pointer-events", "none");

        const group = headGroups.find(g => g.id === d.groupId);
        const sourceNode = nodes.find(n => n.id === d.source)!;
        tooltipDiv
          .html(`Head: Layer ${sourceNode.layer}, Head ${d.head}<br>Weight: ${d.weight.toFixed(4)}${group ? `<br>Group: ${group.name}` : '<br>Individual Head'}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 10) + "px");

        // Highlight edge
        const parent = this.parentElement as unknown as SVGGElement;
        if (parent) {
          d3.select(parent)
            .select<SVGPathElement>(`path[data-source="${d.source}"][data-target="${d.target}"]:not(.hover-target)`)
            .attr("opacity", 0.9)
            .attr("stroke-width", 6);
        }
      })
      .on("mouseout", function(event: MouseEvent, d: Link) {
        // Hide tooltip
        d3.select<HTMLDivElement, unknown>("#graph-tooltip").style("display", "none");

        // Reset edge
        const parent = this.parentElement as unknown as SVGGElement;
        if (parent) {
          d3.select(parent)
            .select<SVGPathElement>(`path[data-source="${d.source}"][data-target="${d.target}"]:not(.hover-target)`)
            .attr("opacity", 0.6)
            .attr("stroke-width", 4);
        }
      });

    // Remove the old tooltips since we're using dynamic ones now
    linkElements.select("title").remove();
    nodeElements.select("title").remove();

    // Add legend
    const legend = svg.append("g")
      .attr("transform", `translate(${width - padding.right + 20}, ${padding.top})`);

    // Add legend title
    legend.append("text")
      .attr("x", 0)
      .attr("y", 0)
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Legend");

    // Add group colors to legend
    headGroups.forEach((group, i) => {
      const y = 30 + i * 25;
      
      // Add color rectangle with click handler
      legend.append("rect")
        .attr("x", 0)
        .attr("y", y)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", getGroupColor(group.id))
        .style("cursor", "pointer")
        .on("click", () => changeGroupColor(group.id));
      
      // Add group name
      legend.append("text")
        .attr("x", 25)
        .attr("y", y + 12)
        .attr("font-size", "12px")
        .text(group.name);
    });

    // Add separator
    const separatorY = 30 + headGroups.length * 25 + 10;
    legend.append("line")
      .attr("x1", 0)
      .attr("x2", legendWidth - padding.left)
      .attr("y1", separatorY)
      .attr("y2", separatorY)
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 2);

    // Add individual heads section title
    legend.append("text")
      .attr("x", 0)
      .attr("y", separatorY + 25)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("Individual Heads");

    // Add individual head colors to legend
    const visibleIndividualHeads = selectedHeads.filter(h => 
      !headGroups.some(g => g.heads.some(gh => gh.layer === h.layer && gh.head === h.head))
    );

    visibleIndividualHeads.forEach((head, i) => {
      const y = separatorY + 40 + i * 25;
      
      // Add color rectangle
      legend.append("rect")
        .attr("x", 0)
        .attr("y", y)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", individualHeadColorScale(head.head.toString()));
      
      // Add head label
      legend.append("text")
        .attr("x", 25)
        .attr("y", y + 12)
        .attr("font-size", "12px")
        .text(`Layer ${head.layer}, Head ${head.head}`);
    });

    // Add tooltip container to DOM if it doesn't exist
    if (!document.getElementById("graph-tooltip")) {
      const tooltipDiv = document.createElement("div");
      tooltipDiv.id = "graph-tooltip";
      tooltipDiv.style.display = "none";
      document.body.appendChild(tooltipDiv);
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

  // Draw the graph whenever relevant state changes
  useEffect(() => {
    if (!data.attentionPatterns.length) return;
    drawGraph();
  }, [data, threshold, selectedHeads, headGroups, drawGraph]);

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

  // Restore focus to textarea after any rendering that might have caused it to lose focus
  useEffect(() => {
    // Only focus if we're not loading and the backend is available
    if (!loading && backendAvailable && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading, backendAvailable, data]);

  return (
    <>
      <style jsx>{sliderStyles}</style>
      <div className="flex flex-col gap-6 p-4 max-w-[1200px] mx-auto">
        <div className="flex justify-between items-start gap-6">
          <div className="flex-1">
            <h2 className="text-white text-2xl font-medium-bold mb-4">Attention Flow Graph</h2>
            
            {backendAvailable === null ? (
              <div className="text-[#3B82F6] text-sm">Checking backend availability...</div>
            ) : (
              <div className="flex flex-col gap-6">
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
                                      backgroundColor: d3.schemePaired[head % 12]
                                    }}
                                  >
                                    {layer},{head}
                                  </button>
                                  {headGroups.length > 0 && (
                                    <button
                                      className="px-1 py-0.5 rounded-r-md text-white text-xs hover:bg-black/20"
                                      style={{
                                        backgroundColor: d3.schemePaired[head % 12]
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
                    <label className="text-sm font-medium mb-3 block">Input Text</label>
                    <textarea
                      ref={textareaRef}
                      className="w-full p-3 text-sm bg-[#F3F4F6] border-0 border-b border-transparent focus:border-[#3B82F6] focus:bg-white focus:outline-none transition-all duration-200 ease-in-out disabled:bg-gray-100 disabled:border-transparent disabled:cursor-not-allowed resize-none rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                      rows={2}
                      placeholder="Enter text to analyze attention patterns..."
                      onChange={(e) => debouncedFetchAttentionData(e.target.value)}
                      disabled={loading || !backendAvailable}
                      defaultValue={"When Mary and John went to the store, John gave a drink to"}
                    />
                    {loading && (
                      <div className="text-xs text-[#3B82F6] mt-2">Loading attention patterns...</div>
                    )}
                    {textError && (
                      <div className="text-xs text-red-500 mt-2">{textError}</div>
                    )}
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
          <div className="border border-gray-100 rounded-lg bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <svg ref={svgRef} width={graphDimensions.width} height={graphDimensions.height}></svg>
          </div>
        )}
      </div>
    </>
  );
};

export default AttentionFlowGraph;
