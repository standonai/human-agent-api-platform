# Using Generated Tools with OpenAI

This guide shows how to use the generated OpenAI tool definitions with the OpenAI API.

## Generate Tool Definitions

First, generate the tool definitions from your OpenAPI spec:

```bash
npm run generate:tools -- -i specs/templates/openapi-template.yaml -o tools/my-api
```

This creates:
- `tools/my-api.openai.json` - OpenAI function calling format
- `tools/my-api.anthropic.json` - Anthropic Claude tool format

## Using with OpenAI API

### Node.js Example

```typescript
import OpenAI from 'openai';
import { readFileSync } from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load generated tools
const tools = JSON.parse(
  readFileSync('tools/my-api.openai.json', 'utf-8')
);

async function callAgent(userMessage: string) {
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant that can interact with our API.',
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  // Call OpenAI with tool definitions
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    tools,
    tool_choice: 'auto',
  });

  const message = response.choices[0].message;

  // Check if the model wants to call a tool
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.log(`Agent called: ${functionName}`);
      console.log('Arguments:', functionArgs);

      // Execute the actual API call
      const result = await executeAPICall(functionName, functionArgs);

      // Add the tool result back to the conversation
      messages.push(message);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Get final response from the agent
    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
    });

    return finalResponse.choices[0].message.content;
  }

  return message.content;
}

async function executeAPICall(functionName: string, args: any) {
  // Map function names to actual API calls
  const baseURL = 'http://localhost:3002';

  switch (functionName) {
    case 'getExample':
      const url = new URL('/example', baseURL);
      if (args.limit) {
        url.searchParams.set('limit', args.limit.toString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-Agent-ID': 'openai-assistant',
          'User-Agent': 'OpenAI-GPT/4.0',
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
import openai
import json
import requests

# Load generated tools
with open('tools/my-api.openai.json', 'r') as f:
    tools = json.load(f)

def call_agent(user_message):
    messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant that can interact with our API."
        },
        {
            "role": "user",
            "content": user_message
        }
    ]

    # Call OpenAI with tool definitions
    response = openai.chat.completions.create(
        model="gpt-4-turbo-preview",
        messages=messages,
        tools=tools,
        tool_choice="auto"
    )

    message = response.choices[0].message

    # Check if the model wants to call a tool
    if message.tool_calls:
        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)

            print(f"Agent called: {function_name}")
            print(f"Arguments: {function_args}")

            # Execute the actual API call
            result = execute_api_call(function_name, function_args)

            # Add the tool result back to the conversation
            messages.append(message)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result)
            })

        # Get final response from the agent
        final_response = openai.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages
        )

        return final_response.choices[0].message.content

    return message.content

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
                'X-Agent-ID': 'openai-assistant',
                'User-Agent': 'OpenAI-GPT/4.0'
            }
        )

        return response.json()

    raise ValueError(f"Unknown function: {function_name}")

# Example usage
response = call_agent("Get the first 10 examples from the API")
print("Agent response:", response)
```

## Key Features

1. **Automatic Tool Discovery**: The agent can see all available API operations
2. **Rich Descriptions**: Parameter constraints and examples help the agent make correct calls
3. **Type Safety**: Schema validation ensures correct parameter types
4. **Error Handling**: Standardized errors help the agent self-correct

## Testing

Test with different prompts:

```javascript
// Zero-shot success test
await callAgent('Get 50 examples');

// Error handling test
await callAgent('Get 200 examples'); // Should fail with helpful error

// Validation test
await callAgent('Validate if getting 75 examples would work'); // Uses dry-run
```

## Best Practices

1. **Update tools when API changes**: Regenerate tool definitions after OpenAPI spec updates
2. **Include agent headers**: Always add `X-Agent-ID` and `User-Agent` headers
3. **Handle errors gracefully**: Parse error responses and present suggestions to the agent
4. **Use dry-run mode**: Validate requests before execution for safety
5. **Monitor agent calls**: Track which operations agents use most
