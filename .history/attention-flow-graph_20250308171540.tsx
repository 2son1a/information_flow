import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

const AttentionFlowGraph = () => {
  const [data, setData] = useState({
    numLayers: 4,
    numTokens: 5,
    attentionPatterns: []
  });
  const [threshold, setThreshold] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const svgRef = useRef(null);
  
  // Generate some sample attention data
  useEffect(() => {
    generateSampleData();
  }, []);
  
  const generateSampleData = () => {
    const numLayers = data.numLayers;
    const numTokens = data.numTokens;
    let attentionPatterns = [];
    
    // For each layer (except layer 0 which has no attention)
    for (let l = 1; l < numLayers; l++) {
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
            weight: weight
          });
        }
      }
    }
    
    setData({
      numLayers,
      numTokens,
      attentionPatterns
    });
  };
  
  // Draw the graph whenever data or threshold changes
  useEffect(() => {
    if (!data.attentionPatterns.length) return;
    drawGraph();
  }, [data, threshold]);
  
  const handleLayersChange = (e) => {
    const value = parseInt(e.target.value);
    setData(prev => ({
      ...prev,
      numLayers: value
    }));
    
    // Regenerate data when layers change
    setTimeout(generateSampleData, 0);
  };
  
  const handleTokensChange = (e) => {
    const value = parseInt(e.target.value);
    setData(prev => ({
      ...prev,
      numTokens: value
    }));
    
    // Regenerate data when tokens change
    setTimeout(generateSampleData, 0);
  };
  
  const handleThresholdChange = (e) => {
    setThreshold(parseFloat(e.target.value));
  };
  
  const uploadAttentionData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
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
    const nodes = [];
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
    
    // Filter edges based on threshold
    const links = data.attentionPatterns
      .filter(edge => edge.weight >= threshold)
      .map(edge => ({
        source: `${edge.sourceLayer}-${edge.sourceToken}`,
        target: `${edge.destLayer}-${edge.destToken}`,
        weight: edge.weight
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
      .attr("x1", d => nodes.find(n => n.id === d.source).x)
      .attr("y1", d => nodes.find(n => n.id === d.source).y)
      .attr("x2", d => nodes.find(n => n.id === d.target).x)
      .attr("y2", d => nodes.find(n => n.id === d.target).y)
      .attr("stroke", d => d3.interpolateBlues(d.weight))
      .attr("stroke-width", d => 1 + d.weight * 5);
    
    // Draw nodes
    const nodeElements = g.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 10)
      .attr("fill", d => d3.schemeCategory10[d.layer % 10]);
    
    // Add node labels
    g.selectAll("text.node-label")
      .data(nodes)
      .enter()
      .append("text")
      .attr("class", "node-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "white")
      .attr("font-size", "8px")
      .text(d => `${d.token}`);
    
    // Add tooltips to edges
    linkElements
      .append("title")
      .text(d => `Weight: ${d.weight.toFixed(4)}`);
    
    // Add tooltips to nodes
    nodeElements
      .append("title")
      .text(d => `Layer ${d.layer}, Token ${d.token}`);
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
            Format: {`{ numLayers: number, numTokens: number, attentionPatterns: [{ sourceLayer, sourceToken, destLayer, destToken, weight }] }`}
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
