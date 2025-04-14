import { z } from 'zod'
import {
  createTool,
  createRoutingAgent,
  anthropic,
} from '@inngest/agent-kit'
import { type NetworkAgent } from './router' // Use our NetworkAgent definition
import { Task } from './state'

// Tool for the router agent to select the next agent or finish
const selectAgentTool = createTool({
  name: 'select_agent',
  description:
    'Select the next agent to handle the task based on the conversation history and agent capabilities, or indicate that the task is finished.',
  parameters: z
    .object({
      agentName: z
        .string()
        .describe(
          'The name (id) of the agent that should handle the request, or \'finished\' if the task is complete.'
        ),
      reasoning: z.string().optional().describe('Brief reasoning for the choice.'),
    })
    .strict(),
  // Use `any` for network context due to type mismatch
  handler: async ({ agentName }, { network }: { network: any }) => {
    if (!network?.agents) {
      // Check if agents map exists on the network object
      throw new Error(
        'select_agent tool cannot access agents within the network context.'
      )
    }
    console.log(`Router selected agent: ${agentName}`)

    if (agentName.toLowerCase() === 'finished') {
      return undefined // Stop iteration
    }

    // Validate agent existence
    const agent = network.agents.get(agentName)
    if (!agent) {
      console.warn(`Router selected non-existent agent: ${agentName}. Stopping.`)
      return undefined // Stop if invalid agent selected
    }

    return agentName // Return the ID of the agent to route to
  },
})

// The Router Agent implementation
export function createAutonomousRouterAgent() {
  return createRoutingAgent({
    name: 'autonomousRouterAgent',
    description:
      'The central orchestrator that analyzes tasks and routes them to specialized agents.',
    model: anthropic({
      model: 'claude-3-5-sonnet-latest',
      defaultParameters: {
        max_tokens: 4096, // Keep this based on examples
      },
    }),
    // Make network optional in the function signature { network?: any }
    system: async ({ network }: { network?: any }): Promise<string> => {
      let agentDescriptions = 'No agents available.'
      let availableAgents: NetworkAgent[] = []

      // Safely access agents map - check if network exists first
      if (network?.agents && network.agents instanceof Map) {
        availableAgents = Array.from(network.agents.values())
        agentDescriptions = availableAgents
          .map(
            (a: NetworkAgent) => // Use our NetworkAgent type here for iteration
              `  <agent>
      <name>${a.id}</name> <!-- Use id for selection -->
      <description>${a.description}</description>
      <capabilities>${a.capabilities.join(', ')}</capabilities>
    </agent>`
          )
          .join('\n')
      }

      // Safely retrieve current task from context - check if network and state exist
      let taskInfo = 'No specific task context available.'
      try {
        const currentTaskId = network?.state?.kv?.get('currentTaskId')
        if (currentTaskId) {
          const task = network?.state?.kv?.get(
            `task_${currentTaskId}`
          ) as Task | undefined
          if (task?.id && task.type && task.status && task.description) {
            taskInfo = `Current Task (ID: ${task.id}, Type: ${task.type}, Status: ${task.status}): ${task.description}`
          }
        }
      } catch (e) {
        console.warn('Could not retrieve task info for router prompt:', e)
      }

      return `You are the central orchestrator for a team of specialized AI agents. Your role is to analyze the overall goal, the current task, and the conversation history to decide the next best step.

${taskInfo}

Available agents:
<agents>
${agentDescriptions}
</agents>

Instructions:
1. Review the current task, conversation history, and agent capabilities.
2. Think step-by-step about what needs to happen next to achieve the task goal.
3. If the task is fully completed based on the history, call the 'select_agent' tool with agentName 'finished'.
4. Otherwise, determine the most suitable agent to perform the *next logical step*.
5. Call the 'select_agent' tool with the chosen agent's name (use the <name> which is the agent ID) and optionally provide reasoning.
6. Be decisive. Choose only one agent for the next step.
`
    },
    tools: [selectAgentTool],
    tool_choice: 'select_agent',
    lifecycle: {
      // Use `any` for result type due to type mismatch
      onRoute: ({ result }: { result: any }) => {
        // Safely access tool calls and their results
        const toolCalls = result?.toolCalls
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
          console.warn('Router agent did not call select_agent tool. Stopping.')
          return // Stop if no tool call
        }

        const toolCall = toolCalls[0]
        if (toolCall?.name !== 'select_agent') {
          console.warn(
            `Router agent called unexpected tool: ${toolCall?.name || 'unknown'}. Stopping.`
          )
          return // Stop if wrong tool called
        }

        const nextAgentId = toolCall.result

        if (nextAgentId === undefined || nextAgentId === null) {
          console.log('Router indicated task is finished or an error occurred.')
          return // Stop the network iteration
        }

        if (typeof nextAgentId !== 'string' || nextAgentId === '') {
            console.warn(`Router returned invalid agent ID: ${nextAgentId}. Stopping.`)
            return // Stop if invalid ID
        }

        // Return an array containing the ID of the next agent to run
        return [nextAgentId]
      },
    },
  })
} 