# Using Generated Tools with Anthropic Claude

This guide shows how to use the generated Anthropic tool definitions with Claude.

## Generate Tool Definitions

First, generate the tool definitions from your OpenAPI spec:

```bash
npm run generate:tools -- -i specs/templates/openapi-template.yaml -o tools/my-api -f anthropic
```

This creates `tools/my-api.anthropic.json` in Anthropic's tool format.

## Using with Anthropic API

### Node.js/TypeScript Example

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load generated tools
const tools = JSON.parse(
  readFileSync('tools/my-api.anthropic.json', 'utf-8')
);

async function callAgent(userMessage: string) {
  const messages = [
    {
      role: 'user',
      content: userMessage,
    },
  ];

  // Call Claude with tool definitions
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: 'You are a helpful assistant that can interact with our API.',
    messages,
    tools,
  });

  // Process tool calls
  if (response.stop_reason === 'tool_use') {
    for (const content of response.content) {
      if (content.type === 'tool_use') {
        console.log(`Agent called: ${content.name}`);
        console.log('Arguments:', content.input);

        // Execute the actual API call
        const result = await executeAPICall(content.name, content.input);

        // Continue conversation with tool result
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: content.id,
              content: JSON.stringify(result),
            },
          ],
        });

        // Get final response
        const finalResponse = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: 'You are a helpful assistant that can interact with our API.',
          messages,
          tools,
        });

        return finalResponse.content[0].type === 'text'
          ? finalResponse.content[0].text
          : null;
      }
    }
  }

  return response.content[0].type === 'text'
    ? response.content[0].text
    : null;
}

async function executeAPICall(functionName: string, args: any) {
  const baseURL = 'http://localhost:3002';

  switch (functionName) {
    case 'getExample':
      const url = new URL('/example', baseURL);
      if (args.limit) {
        url.searchParams.set('limit', args.limit.toString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-Agent-ID': 'anthropic-claude',
          'User-Agent': 'Claude-Agent/1.0',
        },
      });

      return await response.json();

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

// Example usage
callAgent('Get the first 10 examples from the API')
  .then(response => console.log('Agent response:', response))
  .catch(error => console.error('Error:', error));
```

### Python Example

```python
import anthropic
import json
import requests

# Load generated tools
with open('tools/my-api.anthropic.json', 'r') as f:
    tools = json.load(f)

client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

def call_agent(user_message):
    messages = [
        {
            "role": "user",
            "content": user_message
        }
    ]

    # Call Claude with tool definitions
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        system="You are a helpful assistant that can interact with our API.",
        messages=messages,
        tools=tools
    )

    # Process tool calls
    if response.stop_reason == "tool_use":
        for content in response.content:
            if content.type == "tool_use":
                print(f"Agent called: {content.name}")
                print(f"Arguments: {content.input}")

                # Execute the actual API call
                result = execute_api_call(content.name, content.input)

                # Continue conversation with tool result
                messages.append({
                    "role": "assistant",
                    "content": response.content
                })

                messages.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": content.id,
                            "content": json.dumps(result)
                        }
                    ]
                })

                # Get final response
                final_response = client.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=1024,
                    system="You are a helpful assistant that can interact with our API.",
                    messages=messages,
                    tools=tools
                )

                if final_response.content[0].type == "text":
                    return final_response.content[0].text

    if response.content[0].type == "text":
        return response.content[0].text

    return None

def execute_api_call(function_name, args):
    base_url = "http://localhost:3002"

    if function_name == "getExample":
        params = {}
        if 'limit' in args:
            params['limit'] = args['limit']

        response = requests.get(
            f"{base_url}/example",
            params=params,
            headers={
                'X-Agent-ID': 'anthropic-claude',
                'User-Agent': 'Claude-Agent/1.0'
            }
        )

        return response.json()

    raise ValueError(f"Unknown function: {function_name}")

# Example usage
response = call_agent("Get the first 10 examples from the API")
print("Agent response:", response)
```

## Extended Thinking Mode

Claude can use extended thinking for complex API interactions:

```typescript
const response = await anthropic.messages.create({
  model: 'claude-3-7-sonnet-20250219',
  max_tokens: 16000,
  thinking: {
    type: 'enabled',
    budget_tokens: 10000
  },
  messages,
  tools,
});

// The thinking process is available in response.content
for (const content of response.content) {
  if (content.type === 'thinking') {
    console.log('Claude\'s thinking:', content.thinking);
  }
}
```

## Key Features

1. **Natural Language**: Claude excels at understanding complex, conversational API requests
2. **Error Recovery**: Automatically interprets error messages and suggestions
3. **Multi-step Operations**: Can chain multiple API calls to accomplish goals
4. **Thinking Process**: Extended thinking helps with complex API workflows

## Testing

Test with various prompts:

```javascript
// Simple request
await callAgent('Get 50 examples');

// Complex request
await callAgent('Get examples, but first check if requesting 150 would work, if not use the maximum allowed');

// Error handling
await callAgent('Try to get 200 examples and tell me what error you get');
```

## Best Practices

1. **Clear system prompts**: Explain the API's purpose and capabilities
2. **Include agent headers**: Add `X-Agent-ID` and appropriate `User-Agent`
3. **Leverage thinking mode**: Use extended thinking for complex workflows
4. **Handle tool errors**: Return error details so Claude can self-correct
5. **Use dry-run first**: Validate before executing destructive operations
6. **Monitor usage**: Track tool calls and patterns via agent tracking middleware
