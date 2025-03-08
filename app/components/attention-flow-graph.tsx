"use client";

import React, { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react';
import * as d3 from 'd3';
import { debounce } from 'lodash';
import sampleAttentionData from '../data/sample-attention.json';

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
  const [nextGroupId, setNextGroupId] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const svgRef = useRef(null);
  const [error, setError] = useState<string | null>(null);
  
  // Define predefined groups
  const predefinedGroups: PredefinedGroup[] = [
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
  ];
  
  // Initialize predefined head groups
  useEffect(() => {
    const initialGroups = predefinedGroups.map((group, index) => ({
      id: index,
      name: group.name,
      heads: group.vertices.map(([layer, head]) => ({ layer, head })) // Start with all heads active
    }));

    setHeadGroups(initialGroups);
    setNextGroupId(predefinedGroups.length);
  }, []); // Run once on mount
  
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
      // Load sample data when backend is not available
      setData(sampleAttentionData);
      setSelectedHeads([{ layer: 0, head: 0 }]); // Initialize with first head selected
    } else if (backendAvailable === true) {
      // Automatically fetch data for default text when backend is available
      const defaultText = "When Mary and John went to the store, John gave a drink to";
      fetchAttentionData(defaultText);
    }
  }, [backendAvailable]);
  
  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    setThreshold(parseFloat(e.target.value));
  };
  
  const handleHeadSelection = (input: string) => {
    try {
      // Parse a single head pair from the input
      const line = input.trim().split('\n')[0]; // Only take the first line
      if (!line) {
        return;
      }

      const parts = line.split(',');
      if (parts.length !== 2) {
        setError("Invalid format. Please use 'layer,head' format (e.g., '0,1')");
        return;
      }

      const [layer, head] = parts.map(num => parseInt(num.trim()));
      if (isNaN(layer) || isNaN(head)) {
        setError("Layer and head must be numbers");
        return;
      }

      if (layer < 0 || head < 0 || layer >= data.numLayers || head >= data.numHeads) {
        setError(`Layer must be 0-${data.numLayers - 1} and head must be 0-${data.numHeads - 1}`);
        return;
      }

      // Only allow selection if head is not in any group and not already selected
      if (getHeadGroup(layer, head) === null && 
          !selectedHeads.some(h => h.layer === layer && h.head === head)) {
        setSelectedHeads(prev => [...prev, { layer, head }]); // Append to existing heads
        setError(null);
      } else if (getHeadGroup(layer, head) !== null) {
        setError("This head is already part of a group");
      } else {
        setError("This head is already selected");
      }
    } catch (error) {
      setError("Invalid input format");
    }
  };
  
  const uploadAttentionData = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string) as GraphData;
        setData(jsonData);
        setLoading(false);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        alert("Invalid JSON file");
        setLoading(false);
      }
    };
    
    reader.readAsText(file);
  };
  
  const createNewGroup = () => {
    const newGroup: HeadGroup = {
      id: nextGroupId,
      name: `Group ${nextGroupId + 1}`,
      heads: []
    };
    setHeadGroups(prev => [...prev, newGroup]);
    setNextGroupId(prev => prev + 1);
  };

  const deleteGroup = (groupId: number) => {
    // Get heads that were in the deleted group
    const group = headGroups.find(g => g.id === groupId);
    const freedHeads = group?.heads || [];
    
    // Add freed heads to selected heads
    setSelectedHeads(prev => [...prev, ...freedHeads]);
    
    setHeadGroups(prev => prev.filter(g => g.id !== groupId));
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

  const getHeadGroup = (layer: number, head: number): number | null => {
    const group = headGroups.find(g => g.heads.some(h => h.layer === layer && h.head === head));
    return group ? group.id : null;
  };

  const renameGroup = (groupId: number, newName: string) => {
    setHeadGroups(prev => prev.map(group =>
      group.id === groupId
        ? { ...group, name: newName }
        : group
    ));
  };
  
  // Filter edges based on threshold, selected heads, and group membership
  const getVisibleHeads = (): HeadPair[] => {
    // Get all heads that are part of groups
    const groupedHeads = headGroups.flatMap(group => group.heads);
    // Combine with individually selected heads, filtering out any that are in groups
    const individualHeads = selectedHeads.filter(h => 
      !groupedHeads.some(gh => gh.layer === h.layer && gh.head === h.head)
    );
    return [...individualHeads, ...groupedHeads];
  };

  const fetchAttentionData = async (text: string) => {
    try {
      setError(null);
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
    } catch (error) {
      console.error('Error fetching attention data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch attention data');
    } finally {
      setLoading(false);
    }
  };

  // Add debounce to prevent too many API calls
  const debouncedFetchAttentionData = useCallback(
    debounce((text: string) => {
      if (text.trim()) {
        fetchAttentionData(text);
      }
    }, 500),
    []
  );

  const removeHead = (layer: number, head: number) => {
    setSelectedHeads(prev => prev.filter(h => !(h.layer === layer && h.head === head)));
  };

  // Memoize drawGraph to prevent infinite loops
  const drawGraph = React.useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = 900;
    const height = 600; // Increased height
    const padding = {
      top: 50,
      right: 200, // For legend
      bottom: 50,
      left: 50
    };
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
    
    // Create color scales for groups and individual heads
    const groupColorScale = d3.scaleOrdinal(d3.schemeTableau10)
      .domain(headGroups.map(g => g.id.toString()));
    
    const individualHeadColorScale = d3.scaleOrdinal(d3.schemePaired)
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
        .attr("x", padding.left / 2)
        .attr("y", height - (padding.bottom + l * layerHeight))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(l.toString());
    }
    
    // Token labels (now on x-axis)
    for (let t = 0; t < data.numTokens; t++) {
      g.append("text")
        .attr("x", padding.left + t * tokenWidth + tokenWidth / 2)
        .attr("y", height - padding.bottom / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(data.tokens?.[t] || `T${t}`);  // Use actual token if available
    }
    
    // Draw edges first (so they're behind nodes)
    const linkElements = g.selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("x1", (d: Link) => nodes.find(n => n.id === d.source)!.x)
      .attr("y1", (d: Link) => nodes.find(n => n.id === d.source)!.y)
      .attr("x2", (d: Link) => nodes.find(n => n.id === d.target)!.x)
      .attr("y2", (d: Link) => nodes.find(n => n.id === d.target)!.y)
      .attr("stroke", (d: Link) => d.groupId === -1 
        ? individualHeadColorScale(d.head.toString())  // Individual heads
        : groupColorScale(d.groupId.toString())  // Grouped heads
      )
      .attr("stroke-width", 4) // Increased base width
      .attr("opacity", function(d) { return 0.2 + d.weight * 0.8; }) // Scale opacity with weight
      .attr("data-source", (d: Link) => d.source)
      .attr("data-target", (d: Link) => d.target)
      .style("cursor", "pointer")
      .on("mouseover", function(event: MouseEvent, d: Link) {
        d3.select(this)
          .attr("opacity", function() { return 0.4 + d.weight * 0.6; })
          .attr("stroke-width", 6); // Increased hover width
      })
      .on("mouseout", function(event: MouseEvent, d: Link) {
        d3.select(this)
          .attr("opacity", function() { return 0.2 + d.weight * 0.8; })
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

    // Add invisible wider lines for easier edge hovering
    g.selectAll<SVGLineElement, Link>("line.hover-target")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "hover-target")
      .attr("x1", (d: Link) => nodes.find(n => n.id === d.source)!.x)
      .attr("y1", (d: Link) => nodes.find(n => n.id === d.source)!.y)
      .attr("x2", (d: Link) => nodes.find(n => n.id === d.target)!.x)
      .attr("y2", (d: Link) => nodes.find(n => n.id === d.target)!.y)
      .attr("stroke", "transparent")
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
        tooltipDiv
          .html(`Weight: ${d.weight.toFixed(4)}${group ? `<br>Group: ${group.name}` : '<br>Individual Head'}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 10) + "px");

        // Highlight edge
        const parent = this.parentElement as unknown as SVGGElement;
        if (parent) {
          d3.select(parent)
            .select<SVGLineElement>(`line[data-source="${d.source}"][data-target="${d.target}"]:not(.hover-target)`)
            .attr("opacity", function() { return 0.4 + d.weight * 0.6; })
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
            .select<SVGLineElement>(`line[data-source="${d.source}"][data-target="${d.target}"]:not(.hover-target)`)
            .attr("opacity", function() { return 0.2 + d.weight * 0.8; })
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
      
      // Add color rectangle
      legend.append("rect")
        .attr("x", 0)
        .attr("y", y)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", groupColorScale(group.id.toString()));
      
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

  }, [data, threshold, selectedHeads, headGroups]);

  // Draw the graph whenever relevant state changes
  useEffect(() => {
    if (!data.attentionPatterns.length) return;
    drawGraph();
  }, [data, threshold, selectedHeads, headGroups, drawGraph]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <h2 className="text-lg font-medium">Attention Flow Graph</h2>
      
      {backendAvailable === null ? (
        <div className="text-blue-500 text-sm">Checking backend availability...</div>
      ) : (
        <>
          <div className="flex flex-col gap-1 p-2 border rounded text-sm">
            <div>
              <label className="text-sm font-medium">Head Groups</label>
              <div className="space-y-2 mt-1">
                {headGroups.map(group => {
                  const predefinedGroup = predefinedGroups.find(g => g.name === group.name);
                  if (!predefinedGroup) return null;
                  
                  return (
                    <div key={group.id} className="p-2 border rounded">
                      <div className="font-medium text-sm mb-1">{group.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {predefinedGroup.vertices.map(([layer, head]) => (
                          <button
                            key={`${layer}-${head}`}
                            onClick={() => addHeadToGroup(layer, head, group.id)}
                            className="px-2 py-0.5 rounded text-xs transition-colors duration-200"
                            style={{
                              backgroundColor: group.heads.some(h => h.layer === layer && h.head === head)
                                ? d3.schemeTableau10[group.id % 10]
                                : '#f3f4f6',
                              color: group.heads.some(h => h.layer === layer && h.head === head)
                                ? 'white'
                                : '#374151'
                            }}
                          >
                            {layer},{head}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2">
              <label className="text-sm font-medium">Individual Heads</label>
              <div className="space-y-2 mt-1">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Selected heads:</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedHeads.map(({ layer, head }) => (
                      <button
                        key={`${layer}-${head}`}
                        onClick={() => removeHead(layer, head)}
                        className="px-2 py-0.5 rounded text-white text-xs"
                        style={{
                          backgroundColor: d3.schemePaired[head % 12]
                        }}
                      >
                        {layer},{head}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                    handleHeadSelection(input.value);
                    input.value = '';
                  }}>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        className="flex-1 px-2 py-1 border rounded text-xs font-mono"
                        placeholder="layer,head (e.g. 0,1)"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                  {error && (
                    <div className="text-xs text-red-500 mt-1">{error}</div>
                  )}
                  <div className="text-xs text-gray-600 mt-1">
                    Valid: Layer (0-{data.numLayers - 1}), Head (0-{data.numHeads - 1})
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-2">
              <label className="text-sm font-medium">Edge Weight Threshold</label>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={threshold} 
                  onChange={handleThresholdChange}
                  className="flex-1" 
                />
                <span className="text-xs w-12 text-right">{threshold.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          {backendAvailable && (
            <div className="p-2 border rounded text-sm">
              <label className="text-sm font-medium">Input Text</label>
              <textarea
                className="w-full p-2 border rounded mt-1 text-sm"
                rows={2}
                placeholder="Enter text to analyze attention patterns..."
                onChange={(e) => debouncedFetchAttentionData(e.target.value)}
                disabled={loading}
                defaultValue="When Mary and John went to the store, John gave a drink to"
              />
              {loading && (
                <div className="text-xs text-blue-500 mt-1">Loading attention patterns...</div>
              )}
              {error && (
                <div className="text-xs text-red-500 mt-1">{error}</div>
              )}
            </div>
          )}
          
          {!backendAvailable && (
            <div className="p-2 border rounded bg-yellow-50 text-xs">
              <p className="text-yellow-800">
                Backend is not available. Showing sample attention patterns.
              </p>
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center items-center h-80">
              <div className="text-sm">Loading...</div>
            </div>
          ) : (
            <div className="border rounded">
              <svg ref={svgRef} width="900" height="600"></svg>
            </div>
          )}
          
          <div className="p-2 border rounded text-xs">
            <div className="font-medium mb-1">Instructions</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Each circle represents a token at a specific layer</li>
              <li>Edge darkness shows attention weight</li>
              <li>Use threshold to filter weak edges</li>
              {backendAvailable && (
                <li>Type text to analyze attention patterns</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default AttentionFlowGraph;
