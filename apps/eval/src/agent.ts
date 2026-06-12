/**
 * The agent under test: Claude with a single generic http_request tool,
 * a minimal system prompt, and whatever the target API self-describes.
 * No target-specific hand-holding — the API's own DX (error suggestions,
 * discoverability) is exactly what is being measured.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface AgentRunResult {
  httpCalls: number;
  errorResponses: number; // 4xx/5xx the agent received along the way
  turns: number;
  inputTokens: number;
  outputTokens: number;
  transcriptTail: string;
}

const HTTP_TOOL: Anthropic.Tool = {
  name: 'http_request',
  description:
    'Make an HTTP request to the API under test. Use this for every API interaction. ' +
    'Returns the response status and JSON body.',
  input_schema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        description: 'HTTP method',
      },
      path: {
        type: 'string',
        description: 'Request path starting with /, e.g. /api/v2/tasks. Query string allowed.',
      },
      body: {
        type: 'object',
        description: 'JSON request body for mutations',
      },
      headers: {
        type: 'object',
        description: 'Extra request headers, e.g. {"Authorization": "Bearer <token>"}',
      },
    },
    required: ['method', 'path'],
  },
};

export const DEFAULT_EVAL_MODEL = 'claude-haiku-4-5';

export async function runAgent(params: {
  client: Anthropic;
  model: string;
  baseUrl: string;
  apiDoc: string;
  instruction: string;
  maxToolCalls?: number;
}): Promise<AgentRunResult> {
  const { client, model, baseUrl, apiDoc, instruction } = params;
  const maxToolCalls = params.maxToolCalls ?? 15;

  const system =
    'You are an autonomous agent completing one task against an HTTP API. ' +
    'Use the http_request tool for every API call. Track any tokens or ids you receive ' +
    'and send required headers yourself. When the task is complete, stop calling tools ' +
    'and reply with a one-sentence summary.\n\n' +
    `API documentation:\n${apiDoc}`;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: instruction }];

  let httpCalls = 0;
  let errorResponses = 0;
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = '';

  for (;;) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: [HTTP_TOOL],
      messages,
    });

    turns += 1;
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    for (const block of response.content) {
      if (block.type === 'text') lastText = block.text;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (httpCalls >= maxToolCalls) {
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Tool call budget exhausted. Stop and summarize.',
          is_error: true,
        });
        continue;
      }
      httpCalls += 1;
      const outcome = await executeHttpRequest(baseUrl, toolUse.input as HttpRequestInput);
      if (outcome.status >= 400) errorResponses += 1;
      results.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(outcome),
      });
    }
    messages.push({ role: 'user', content: results });

    if (httpCalls >= maxToolCalls && toolUses.length > 0) {
      // One more turn to let the agent summarize, then the loop exits
      // naturally when it stops calling tools.
    }
  }

  return {
    httpCalls,
    errorResponses,
    turns,
    inputTokens,
    outputTokens,
    transcriptTail: lastText.slice(0, 300),
  };
}

interface HttpRequestInput {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function executeHttpRequest(
  baseUrl: string,
  input: HttpRequestInput
): Promise<{ status: number; body: unknown }> {
  try {
    const url = new URL(input.path, baseUrl);
    const response = await fetch(url, {
      method: input.method,
      headers: {
        'content-type': 'application/json',
        ...(input.headers || {}),
      },
      body:
        input.body !== undefined && input.method !== 'GET'
          ? JSON.stringify(input.body)
          : undefined,
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 500);
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: `request failed: ${(error as Error).message}` };
  }
}
