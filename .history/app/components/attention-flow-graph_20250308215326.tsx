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

const AttentionFlowGraph = () => {
  const [data, setData] = useState<GraphData>({
    numLayers: 4,
    numTokens: 5,
    numHeads: 4,
    attentionPatterns: [],
    tokens: Array(5).fill('token')
  });
  const [threshold, setThreshold] = useState(0.1);
  const [selectedHeads, setSelectedHeads] = useState<HeadPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [headGroups, setHeadGroups] = useState<HeadGroup[]>([]);
  const [nextGroupId, setNextGroupId] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const svgRef = useRef(null);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize predefined head groups
  useEffect(() => {
    const predefinedGroups = [
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

    const initialGroups = predefinedGroups.map((group, index) => ({
      id: index,
      name: group.name,
      heads: group.vertices.map(([layer, head]) => ({ layer, head }))
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
    }
  }, [backendAvailable]);
  
  const generateSampleData = () => {
    generateSampleDataWithParams(data);
  };
  
  const generateSampleDataWithParams = (params: GraphData) => {
    const numLayers = params.numLayers;
    const numTokens = params.numTokens;
    const numHeads = params.numHeads;
    const attentionPatterns = [];
    
    // For each layer (except layer 0 which has no attention)
    for (let l = 1; l < numLayers; l++) {
      // For each attention head
      for (let h = 0; h < numHeads; h++) {
        // For each destination token in this layer
        for (let destT = 0; destT < numTokens; destT++) {
          // For each source token in previous layer
          for (let srcT = 0; srcT < numTokens; srcT++) {
            // Generate random attention weight
            const weight = Math.random();
            attentionPatterns.push({
              sourceLayer: l-1,
              sourceToken: srcT,
              destLayer: l,
              destToken: destT,
              weight: weight,
              head: h
            });
          }
        }
      }
    }
    
    setData({
      numLayers,
      numTokens,
      numHeads,
      attentionPatterns
    });
    
    // Initialize selected heads if empty
    if (selectedHeads.length === 0) {
      setSelectedHeads([{ layer: 0, head: 0 }]); // Default to first head
    }
  };
  
  // Memoize drawGraph to prevent infinite loops
  const drawGraph = React.useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = 900;
    const height = 500;
    const padding = 50;
    const tokenWidth = (width - 2 * padding) / (data.numTokens);
    const layerHeight = (height - 2 * padding) / (data.numLayers);
    
    // Create nodes
    const nodes: Node[] = [];
    for (let l = 0; l < data.numLayers; l++) {
      for (let t = 0; t < data.numTokens; t++) {
        nodes.push({
          id: `${l}-${t}`,
          layer: l,
          token: t,
          x: padding + t * tokenWidth + tokenWidth / 2,
          y: height - (padding + l * layerHeight + layerHeight / 2), // Invert y-coordinate
        });
      }
    }
    
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
    
    // Create color scales for groups and individual heads
    const groupColorScale = d3.scaleOrdinal(d3.schemeTableau10)
      .domain(headGroups.map(g => g.id.toString()));
    
    const individualHeadColorScale = d3.scaleOrdinal(d3.schemePaired)
      .domain(Array.from({length: data.numHeads}, (_, i) => i.toString()));
    
    // Draw layers and tokens labels
    const g = svg.append("g");
    
    // Layer labels (now on y-axis)
    for (let l = 0; l < data.numLayers; l++) {
      g.append("text")
        .attr("x", padding / 2)
        .attr("y", height - (padding + l * layerHeight + layerHeight / 2))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(l.toString());
    }
    
    // Token labels (now on x-axis)
    for (let t = 0; t < data.numTokens; t++) {
      g.append("text")
        .attr("x", padding + t * tokenWidth + tokenWidth / 2)
        .attr("y", height - padding / 2)
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
      .attr("stroke-width", (d: Link) => 1 + d.weight * 5)
      .attr("opacity", 0.5);
    
    // Draw nodes
    const nodeElements = g.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("cx", (d: Node) => d.x)
      .attr("cy", (d: Node) => d.y)
      .attr("r", 10)
      .attr("fill", "#e5e7eb");  // Light gray color from Tailwind's gray-200
    
    // Add node labels
    g.selectAll("text.node-label")
      .data(nodes)
      .enter()
      .append("text")
      .attr("class", "node-label")
      .attr("x", (d: Node) => d.x)
      .attr("y", (d: Node) => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "black")
      .attr("font-size", "8px")
      .text("");  // Remove the token number from nodes
    
    // Add tooltips to edges
    linkElements
      .append("title")
      .text((d: Link) => {
        const group = headGroups.find(g => g.id === d.groupId);
        return `Weight: ${d.weight.toFixed(4)}${group ? `\nGroup: ${group.name}` : '\nIndividual Head'}`;
      });
    
    // Add tooltips to nodes
    nodeElements
      .append("title")
      .text((d: Node) => `Layer ${d.layer}, Token ${d.token}`);
  }, [data, threshold, selectedHeads, headGroups]);

  // Draw the graph whenever relevant state changes
  useEffect(() => {
    if (!data.attentionPatterns.length) return;
    drawGraph();
  }, [data, threshold, selectedHeads, headGroups, drawGraph]);
  
  const handleLayersChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => {
      const newData = {
        ...prev,
        numLayers: value
      };
      // Immediately generate new data
      generateSampleDataWithParams(newData);
      return newData;
    });
  };
  
  const handleTokensChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => {
      const newData = {
        ...prev,
        numTokens: value
      };
      // Immediately generate new data
      generateSampleDataWithParams(newData);
      return newData;
    });
  };
  
  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    setThreshold(parseFloat(e.target.value));
  };
  
  const handleHeadSelection = (layer: number, head: number) => {
    // Only allow selection of ungrouped heads
    if (getHeadGroup(layer, head) === null) {
      setSelectedHeads(prev => {
        const isSelected = prev.some(h => h.layer === layer && h.head === head);
        if (isSelected) {
          return prev.filter(h => !(h.layer === layer && h.head === head));
        } else {
          return [...prev, { layer, head }];
        }
      });
    }
  };
  
  const handleNumHeadsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => {
      const newData = {
        ...prev,
        numHeads: value
      };
      // Immediately generate new data
      generateSampleDataWithParams(newData);
      return newData;
    });
    
    // Reset selected heads
    setSelectedHeads([{ layer: 0, head: 0 }]);
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

      // If head is already in this group, remove it
      if (targetGroup.heads.some(h => h.layer === layer && h.head === head)) {
        return prev.map(group =>
          group.id === groupId
            ? { ...group, heads: group.heads.filter(h => !(h.layer === layer && h.head === head)) }
            : group
        );
      }

      // Remove head from any other group first
      const groupsWithoutHead = prev.map(group => ({
        ...group,
        heads: group.heads.filter(h => !(h.layer === layer && h.head === head))
      }));
      
      // Then add head to new group
      return groupsWithoutHead.map(group => 
        group.id === groupId 
          ? { ...group, heads: [...group.heads, { layer, head }] }
          : group
      );
    });

    // Add to selected heads when removing from group
    const currentGroup = headGroups.find(g => g.heads.some(h => h.layer === layer && h.head === head));
    if (currentGroup?.id === groupId) {
      setSelectedHeads(prev => [...prev, { layer, head }]);
    } else {
      // Remove from selected heads when adding to a group
      setSelectedHeads(prev => prev.filter(h => !(h.layer === layer && h.head === head)));
    }
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

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-bold">Attention Flow Graph</h2>
      
      {backendAvailable === null ? (
        <div className="text-blue-500">Checking backend availability...</div>
      ) : (
        <>
          <div className="flex flex-col gap-2 p-4 border rounded">
            <h3 className="text-lg font-semibold">Configuration</h3>
            
            {/* Only show configuration controls if backend is available */}
            {backendAvailable && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">Number of Layers:</label>
                  <input 
                    type="range" 
                    min="2" 
                    max="10" 
                    value={data.numLayers} 
                    onChange={handleLayersChange} 
                    className="w-full"
                  />
                  <span>{data.numLayers}</span>
                </div>
                
                <div>
                  <label className="block text-sm font-medium">Number of Tokens:</label>
                  <input 
                    type="range" 
                    min="2" 
                    max="20" 
                    value={data.numTokens} 
                    onChange={handleTokensChange}
                    className="w-full" 
                  />
                  <span>{data.numTokens}</span>
                </div>

                <div>
                  <label className="block text-sm font-medium">Number of Heads:</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="12" 
                    value={data.numHeads} 
                    onChange={handleNumHeadsChange}
                    className="w-full" 
                  />
                  <span>{data.numHeads}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Head Groups:</label>
              <div className="space-y-4">
                <button 
                  onClick={createNewGroup}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 w-fit"
                >
                  Create New Group
                </button>
                
                {headGroups.map(group => (
                  <div key={group.id} className="flex flex-col gap-2 p-3 border rounded">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => renameGroup(group.id, e.target.value)}
                        className="px-2 py-1 border rounded"
                      />
                      <button
                        onClick={() => deleteGroup(group.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {Array.from({ length: data.numLayers }, (_, layer) => (
                        <div key={layer} className="border-b pb-2">
                          <div className="font-medium mb-2">Layer {layer}</div>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: data.numHeads }, (_, head) => (
                              <button
                                key={`${layer}-${head}`}
                                onClick={() => addHeadToGroup(layer, head, group.id)}
                                className={`px-3 py-1 rounded ${
                                  group.heads.some(h => h.layer === layer && h.head === head)
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                Head {head}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Individual Heads:</label>
              <div className="space-y-4">
                {Array.from({ length: data.numLayers }, (_, layer) => (
                  <div key={layer} className="border-b pb-2">
                    <div className="font-medium mb-2">Layer {layer}</div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: data.numHeads }, (_, head) => {
                        const groupId = getHeadGroup(layer, head);
                        const isGrouped = groupId !== null;
                        const isSelected = selectedHeads.some(h => h.layer === layer && h.head === head);
                        return (
                          <button
                            key={`${layer}-${head}`}
                            onClick={() => handleHeadSelection(layer, head)}
                            className={`px-3 py-1 rounded ${
                              isGrouped 
                                ? 'opacity-50 cursor-not-allowed'
                                : isSelected
                                  ? 'text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            style={{
                              backgroundColor: isGrouped 
                                ? d3.schemeTableau10[groupId % 10]
                                : isSelected
                                  ? d3.schemePaired[head % 12]
                                  : undefined
                            }}
                            disabled={isGrouped}
                            title={isGrouped ? `Head ${head} is part of ${headGroups.find(g => g.id === groupId)?.name}` : undefined}
                          >
                            Head {head}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium">Edge Weight Threshold:</label>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={threshold} 
                onChange={handleThresholdChange}
                className="w-full" 
              />
              <span>{threshold.toFixed(2)}</span>
            </div>
            
            {/* Only show these controls if backend is available */}
            {backendAvailable && (
              <>
                <div>
                  <label className="block text-sm font-medium">Upload Attention Data (JSON):</label>
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={uploadAttentionData}
                    className="w-full" 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: {`{ numLayers: number, numTokens: number, numHeads: number, attentionPatterns: [{ sourceLayer, sourceToken, destLayer, destToken, weight, head }] }`}
                  </p>
                </div>
                
                <button 
                  onClick={generateSampleData}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Generate Random Data
                </button>
              </>
            )}
          </div>
          
          {/* Only show text input if backend is available */}
          {backendAvailable && (
            <div className="flex flex-col gap-2 p-4 border rounded">
              <h3 className="text-lg font-semibold">Input Text</h3>
              <textarea
                className="w-full p-2 border rounded"
                rows={3}
                placeholder="Enter text to analyze attention patterns..."
                onChange={(e) => debouncedFetchAttentionData(e.target.value)}
                disabled={loading}
                defaultValue="When Mary and John went to the store, John gave a drink to"
              />
              {loading && (
                <div className="text-blue-500">Loading attention patterns...</div>
              )}
              {error && (
                <div className="text-red-500">{error}</div>
              )}
            </div>
          )}
          
          {/* Show backend status message */}
          {!backendAvailable && (
            <div className="p-4 border rounded bg-yellow-50">
              <p className="text-yellow-800">
                Backend is not available. Showing sample attention patterns for the text: "The quick brown fox jumped over the lazy dog"
              </p>
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center items-center h-96">
              <div className="text-xl">Loading...</div>
            </div>
          ) : (
            <div className="border rounded overflow-auto">
              <svg ref={svgRef} width="900" height="500"></svg>
            </div>
          )}
          
          <div className="p-4 border rounded">
            <h3 className="text-lg font-semibold">Instructions</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Each circle represents a token at a specific layer</li>
              <li>The darkness of the edge represents attention weight</li>
              <li>Adjust the threshold slider to filter out edges with weights below threshold</li>
              {backendAvailable && (
                <>
                  <li>Upload your own attention patterns in JSON format</li>
                  <li>Generate random data to test the visualization</li>
                  <li>Type text in the input box to analyze its attention patterns</li>
                </>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default AttentionFlowGraph;
