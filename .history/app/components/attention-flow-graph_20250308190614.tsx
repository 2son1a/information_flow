"use client";

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import * as d3 from 'd3';

interface AttentionPattern {
  sourceLayer: number;
  sourceToken: number;
  destLayer: number;
  destToken: number;
  weight: number;
  head: number;
}

interface HeadGroup {
  id: number;
  name: string;
  heads: number[];
}

interface GraphData {
  numLayers: number;
  numTokens: number;
  numHeads: number;
  attentionPatterns: AttentionPattern[];
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
    attentionPatterns: []
  });
  const [threshold, setThreshold] = useState(0.1);
  const [selectedHeads, setSelectedHeads] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [headGroups, setHeadGroups] = useState<HeadGroup[]>([]);
  const [nextGroupId, setNextGroupId] = useState(0);
  const svgRef = useRef(null);
  
  // Generate some sample attention data
  useEffect(() => {
    generateSampleData();
  }, []);
  
  const generateSampleData = () => {
    const numLayers = data.numLayers;
    const numTokens = data.numTokens;
    const numHeads = data.numHeads;
    let attentionPatterns = [];
    
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
      setSelectedHeads([0]); // Default to first head
    }
  };
  
  // Draw the graph whenever data or threshold changes
  useEffect(() => {
    if (!data.attentionPatterns.length) return;
    drawGraph();
  }, [data, threshold]);
  
  const handleLayersChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => ({
      ...prev,
      numLayers: value
    }));
    
    // Regenerate data when layers change
    setTimeout(generateSampleData, 0);
  };
  
  const handleTokensChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => ({
      ...prev,
      numTokens: value
    }));
    
    // Regenerate data when tokens change
    setTimeout(generateSampleData, 0);
  };
  
  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    setThreshold(parseFloat(e.target.value));
  };
  
  const handleHeadSelection = (head: number) => {
    setSelectedHeads(prev => {
      if (prev.includes(head)) {
        return prev.filter(h => h !== head);
      } else {
        return [...prev, head];
      }
    });
  };
  
  const handleNumHeadsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setData(prev => ({
      ...prev,
      numHeads: value
    }));
    
    // Reset selected heads
    setSelectedHeads([0]);
    
    // Regenerate data when heads change
    setTimeout(generateSampleData, 0);
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
  
  const drawGraph = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = 900;
    const height = 500;
    const padding = 50;
    const layerWidth = (width - 2 * padding) / (data.numLayers);
    const tokenHeight = (height - 2 * padding) / (data.numTokens);
    
    // Create nodes
    const nodes: Node[] = [];
    for (let l = 0; l < data.numLayers; l++) {
      for (let t = 0; t < data.numTokens; t++) {
        nodes.push({
          id: `${l}-${t}`,
          layer: l,
          token: t,
          x: padding + l * layerWidth + layerWidth / 2,
          y: padding + t * tokenHeight + tokenHeight / 2,
        });
      }
    }
    
    // Filter edges based on threshold and selected heads
    const links: Link[] = data.attentionPatterns
      .filter(edge => edge.weight >= threshold && selectedHeads.includes(edge.head))
      .map(edge => ({
        source: `${edge.sourceLayer}-${edge.sourceToken}`,
        target: `${edge.destLayer}-${edge.destToken}`,
        weight: edge.weight,
        head: edge.head
      }));
    
    // Draw layers and tokens labels
    const g = svg.append("g");
    
    // Layer labels
    for (let l = 0; l < data.numLayers; l++) {
      g.append("text")
        .attr("x", padding + l * layerWidth + layerWidth / 2)
        .attr("y", padding / 2)
        .attr("text-anchor", "middle")
        .text(`Layer ${l}`);
    }
    
    // Token labels
    for (let t = 0; t < data.numTokens; t++) {
      g.append("text")
        .attr("x", padding / 2)
        .attr("y", padding + t * tokenHeight + tokenHeight / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(`T${t}`);
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
      .attr("stroke", (d: Link) => d3.schemeTableau10[d.head % 10])
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
      .attr("fill", (d: Node) => d3.schemeCategory10[d.layer % 10]);
    
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
      .attr("fill", "white")
      .attr("font-size", "8px")
      .text((d: Node) => `${d.token}`);
    
    // Add tooltips to edges
    linkElements
      .append("title")
      .text((d: Link) => `Weight: ${d.weight.toFixed(4)}`);
    
    // Add tooltips to nodes
    nodeElements
      .append("title")
      .text((d: Node) => `Layer ${d.layer}, Token ${d.token}`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-bold">Attention Flow Graph</h2>
      
      <div className="flex flex-col gap-2 p-4 border rounded">
        <h3 className="text-lg font-semibold">Configuration</h3>
        
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

        <div>
          <label className="block text-sm font-medium mb-2">Attention Heads:</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({length: data.numHeads}, (_, i) => (
              <button
                key={i}
                onClick={() => handleHeadSelection(i)}
                className={`px-3 py-1 rounded ${
                  selectedHeads.includes(i)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Head {i}
              </button>
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
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-96">
          <p>Loading...</p>
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
          <li>Upload your own attention patterns in JSON format</li>
          <li>Generate random data to test the visualization</li>
        </ul>
      </div>
    </div>
  );
};

export default AttentionFlowGraph;
