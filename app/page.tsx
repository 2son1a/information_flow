import AttentionFlowGraph from './components/attention-flow-graph';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-gray-800 text-3xl font-bold mb-8">Information Flow Visualization</h1>
      <AttentionFlowGraph />
    </main>
  );
}
