/**
 * Example 09 — Gemma 4 Auto-Orchestration (runTeam, 100% Local)
 *
 * Demonstrates the framework's key feature — automatic task decomposition —
 * powered entirely by a local Gemma 4 model. No cloud API needed.
 *
 * What happens:
 * 1. A Gemma 4 "coordinator" receives the goal + agent roster
 * 2. It outputs a structured JSON task array (title, description, assignee, dependsOn)
 * 3. The framework resolves dependencies, schedules tasks, and runs agents
 * 4. The coordinator synthesises all task results into a final answer
 *
 * This is the hardest test for a local model — it must produce valid JSON
 * for task decomposition AND do tool-calling for actual task execution.
 * Gemma 4 e2b (5.1B params) handles both reliably.
 *
 * Run:
 *   no_proxy=localhost npx tsx examples/09-gemma4-auto-orchestration.ts
 *
 * Prerequisites:
 *   1. Ollama >= 0.20.0 installed and running: https://ollama.com
 *   2. Pull the model: ollama pull gemma4:e2b
 *   3. No API keys needed!
 *
 * Note: The no_proxy=localhost prefix is needed if you have an HTTP proxy
 * configured, since the OpenAI SDK would otherwise route Ollama requests
 * through the proxy.
 */

import { OpenMultiAgent } from '../src/index.js'
import type { AgentConfig, OrchestratorEvent, Task } from '../src/types.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// See available tags at https://ollama.com/library/gemma4
const OLLAMA_MODEL = 'gemma4:e2b'      // or 'gemma4:e4b', 'gemma4:26b'
const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

// ---------------------------------------------------------------------------
// Agents — the coordinator is created automatically by runTeam()
// ---------------------------------------------------------------------------

const researcher: AgentConfig = {
  name: 'researcher',
  model: OLLAMA_MODEL,
  provider: 'openai',
  baseURL: OLLAMA_BASE_URL,
  apiKey: 'ollama',
  systemPrompt: `You are a system researcher. Use bash to run non-destructive,
read-only commands and report the results concisely.`,
  tools: ['bash'],
  maxTurns: 4,
}

const writer: AgentConfig = {
  name: 'writer',
  model: OLLAMA_MODEL,
  provider: 'openai',
  baseURL: OLLAMA_BASE_URL,
  apiKey: 'ollama',
  systemPrompt: `You are a technical writer. Use file_write to create clear,
structured Markdown reports based on the information provided.`,
  tools: ['file_write'],
  maxTurns: 4,
}

// ---------------------------------------------------------------------------
// Progress handler
// ---------------------------------------------------------------------------

function handleProgress(event: OrchestratorEvent): void {
  const ts = new Date().toISOString().slice(11, 23)
  switch (event.type) {
    case 'task_start': {
      const task = event.data as Task | undefined
      console.log(`[${ts}] TASK START    "${task?.title ?? event.task}" → ${task?.assignee ?? '?'}`)
      break
    }
    case 'task_complete':
      console.log(`[${ts}] TASK DONE     "${event.task}"`)
      break
    case 'agent_start':
      console.log(`[${ts}] AGENT START   ${event.agent}`)
      break
    case 'agent_complete':
      console.log(`[${ts}] AGENT DONE    ${event.agent}`)
      break
    case 'error':
      console.error(`[${ts}] ERROR         ${event.agent ?? ''}  task=${event.task ?? '?'}`)
      break
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — defaultModel is used for the coordinator agent
// ---------------------------------------------------------------------------

const orchestrator = new OpenMultiAgent({
  defaultModel: OLLAMA_MODEL,
  defaultProvider: 'openai',
  defaultBaseURL: OLLAMA_BASE_URL,
  defaultApiKey: 'ollama',
  maxConcurrency: 1, // local model serves one request at a time
  onProgress: handleProgress,
})

const team = orchestrator.createTeam('gemma4-auto', {
  name: 'gemma4-auto',
  agents: [researcher, writer],
  sharedMemory: true,
})

// ---------------------------------------------------------------------------
// Give a goal — the framework handles the rest
// ---------------------------------------------------------------------------

const goal = `Check this machine's Node.js version, npm version, and OS info,
then write a short Markdown summary report to /tmp/gemma4-auto/report.md`

console.log('Gemma 4 Auto-Orchestration — Zero API Cost')
console.log('='.repeat(60))
console.log(`  model        → ${OLLAMA_MODEL} via Ollama (all agents + coordinator)`)
console.log(`  researcher   → bash`)
console.log(`  writer       → file_write`)
console.log(`  coordinator  → auto-created by runTeam()`)
console.log()
console.log(`Goal: ${goal.replace(/\n/g, ' ').trim()}`)
console.log('='.repeat(60))

const start = Date.now()
const result = await orchestrator.runTeam(team, goal)
const totalTime = Date.now() - start

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60))
console.log('Pipeline complete.\n')
console.log(`Overall success: ${result.success}`)
console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`)
console.log(`Tokens — input: ${result.totalTokenUsage.input_tokens}, output: ${result.totalTokenUsage.output_tokens}`)

console.log('\nPer-agent results:')
for (const [name, r] of result.agentResults) {
  const icon = r.success ? 'OK  ' : 'FAIL'
  const tools = r.toolCalls.length > 0 ? r.toolCalls.map(c => c.toolName).join(', ') : '(none)'
  console.log(`  [${icon}] ${name.padEnd(24)} tools: ${tools}`)
}

// Print the coordinator's final synthesis
const coordResult = result.agentResults.get('coordinator')
if (coordResult?.success) {
  console.log('\nFinal synthesis (from local Gemma 4 coordinator):')
  console.log('-'.repeat(60))
  console.log(coordResult.output)
  console.log('-'.repeat(60))
}

console.log('\nAll processing done locally. $0 API cost.')
