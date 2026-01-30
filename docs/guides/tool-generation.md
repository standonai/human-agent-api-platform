# Tool Definition Generation

Automatically convert OpenAPI 3.1 specifications into AI agent-consumable tool definitions.

## Overview

The platform includes a powerful tool generation system that converts OpenAPI specifications into formats that AI agents (OpenAI GPT, Anthropic Claude) can directly consume. This enables:

- **Automatic API Discovery**: Agents can see all available operations
- **Zero-Shot Success**: Rich descriptions enable correct first-attempt calls
- **Type Safety**: Schema validation ensures proper parameter types
- **Self-Correction**: Detailed errors help agents fix mistakes

## Quick Start

```bash
# Generate tool definitions for both OpenAI and Anthropic
npm run generate:tools -- -i specs/my-api.yaml -o tools/my-api

# Generate only OpenAI format
npm run generate:tools -- -i specs/my-api.yaml -o tools/my-api -f openai

# Generate only Anthropic format
npm run generate:tools -- -i specs/my-api.yaml -o tools/my-api -f anthropic
```

## Output Formats

### OpenAI Function Calling

Generated file: `tools/my-api.openai.json`

```json
[
  {
    "type": "function",
    "function": {
      "name": "getUsers",
      "description": "GET /api/users\n\nRetrieve a list of users",
      "parameters": {
        "type": "object",
        "properties": {
          "limit": {
            "type": "integer",
            "description": "Maximum results. Range: 1-100. Default: 20"
          }
        },
        "required": []
      }
    }
  }
]
```

### Anthropic Claude Tools

Generated file: `tools/my-api.anthropic.json`

```json
[
  {
    "name": "getUsers",
    "description": "GET /api/users\n\nRetrieve a list of users",
    "input_schema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "integer",
          "description": "Maximum results. Range: 1-100. Default: 20"
        }
      }
    }
  }
]
```

## CLI Usage

```bash
generate-tools [options]

Options:
  -i, --input <file>     Input OpenAPI spec file (JSON or YAML)
  -o, --output <file>    Output file path (without extension)
  -f, --format <format>  Output format: 'openai', 'anthropic', or 'both' (default: 'both')
  --no-pretty            Disable pretty-printing JSON output
  -h, --help             Show help message
```

## Programmatic Usage

### Parse OpenAPI Spec

```typescript
import { parseOpenAPISpec } from 'human-agent-api-platform';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';

// Load OpenAPI spec
const specContent = readFileSync('api-spec.yaml', 'utf-8');
const spec = yaml.load(specContent);

// Parse to generic format
const tools = parseOpenAPISpec(spec);

console.log(`Found ${tools.length} operations`);
```

### Convert to OpenAI Format

```typescript
import { convertToOpenAI, convertMultipleToOpenAI } from 'human-agent-api-platform';

// Convert single tool
const openaiTool = convertToOpenAI(genericTool);

// Convert multiple tools
const openaiTools = convertMultipleToOpenAI(genericTools);

// Use with OpenAI API
const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo-preview',
  messages: [...],
  tools: openaiTools,
});
```

### Convert to Anthropic Format

```typescript
import { convertToAnthropic, convertMultipleToAnthropic } from 'human-agent-api-platform';

// Convert single tool
const anthropicTool = convertToAnthropic(genericTool);

// Convert multiple tools
const anthropicTools = convertMultipleToAnthropic(genericTools);

// Use with Anthropic API
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [...],
  tools: anthropicTools,
});
```

## What Gets Converted

### Parameters

All parameter types are converted:
- **Path parameters**: `/users/{id}`
- **Query parameters**: `/users?limit=20`
- **Header parameters**: Custom headers
- **Body parameters**: JSON request bodies

### Enriched Descriptions

Parameter descriptions are automatically enriched with:
- **Format constraints**: `Format: email`, `Format: date-time`
- **Range constraints**: `Range: 1-100`, `Minimum: 0`
- **Default values**: `Default: 20`
- **Examples**: `Example: "user@example.com"`
- **Enum values**: Available options

### Method Information

Each tool description includes:
- HTTP method and path
- Original operation description
- Summary of what the endpoint does

## Best Practices

### 1. Rich OpenAPI Specs

The quality of generated tools depends on your OpenAPI spec:

```yaml
# Good: Rich descriptions
parameters:
  - name: limit
    in: query
    description: Maximum number of results to return. Use smaller values for faster responses.
    schema:
      type: integer
      minimum: 1
      maximum: 100
      default: 20
      example: 50

# Bad: Minimal descriptions
parameters:
  - name: limit
    in: query
    schema:
      type: integer
```

### 2. Use Examples

Provide examples in your OpenAPI spec:

```yaml
schema:
  type: object
  properties:
    email:
      type: string
      format: email
      example: "user@example.com"
    status:
      type: string
      enum: [active, inactive, pending]
      example: "active"
```

### 3. Document Constraints

Always specify:
- `minimum` and `maximum` for numbers
- `minLength` and `maxLength` for strings
- `format` for formatted strings (email, date, etc.)
- `pattern` for regex validation

### 4. Meaningful Operation IDs

Use clear, descriptive `operationId` values:

```yaml
# Good
paths:
  /api/users:
    get:
      operationId: listUsers
      summary: List all users

# Bad
paths:
  /api/users:
    get:
      operationId: get_api_users
      summary: GET /api/users
```

### 5. Regenerate After Changes

Always regenerate tool definitions when your API changes:

```bash
# Add to your CI/CD pipeline
npm run generate:tools -- -i specs/api.yaml -o tools/api
git add tools/api.*.json
```

## Integration Examples

See detailed integration guides:
- [Using Tools with OpenAI](../examples/using-tools-openai.md)
- [Using Tools with Anthropic](../examples/using-tools-anthropic.md)

## Troubleshooting

### Missing Descriptions

**Problem**: Generated tools have empty descriptions

**Solution**: Ensure all parameters have `description` fields in your OpenAPI spec

### Type Mismatches

**Problem**: Agent sends wrong parameter types

**Solution**: Verify your OpenAPI schema types are correct and include format constraints

### Large Tool Sets

**Problem**: Too many tools generated (>20)

**Solution**:
- Split your API into logical groups
- Generate separate tool sets per domain
- Use tags to filter operations

### $ref Resolution

**Problem**: `$ref` references not resolving

**Solution**: Ensure `$ref` uses format `#/components/schemas/SchemaName` and schema exists

## Advanced Usage

### Custom Converters

Create custom converters for other agent frameworks:

```typescript
import { GenericToolDefinition } from 'human-agent-api-platform';

export function convertToCustomFormat(tool: GenericToolDefinition): CustomTool {
  return {
    toolName: tool.name,
    toolDescription: tool.description,
    inputParams: convertParameters(tool.parameters),
  };
}
```

### Filter Operations

Only convert specific operations:

```typescript
import { parseOpenAPISpec } from 'human-agent-api-platform';

const allTools = parseOpenAPISpec(spec);

// Filter by tag
const userTools = allTools.filter(tool =>
  spec.paths[tool.path]?.[tool.method.toLowerCase()]?.tags?.includes('users')
);

// Filter by method
const readOnlyTools = allTools.filter(tool => tool.method === 'GET');
```

### Validate Generated Tools

Test generated tools before deployment:

```typescript
import { convertToOpenAI } from 'human-agent-api-platform';

const tool = convertToOpenAI(genericTool);

// Validate structure
if (!tool.function.name || !tool.function.description) {
  throw new Error('Invalid tool: missing name or description');
}

// Validate parameters
if (Object.keys(tool.function.parameters.properties).length === 0) {
  console.warn(`Tool ${tool.function.name} has no parameters`);
}
```

## Architecture

The tool generation system uses a three-stage pipeline:

1. **Parse**: OpenAPI → Generic Tool Definition
2. **Convert**: Generic → Agent-Specific Format
3. **Output**: JSON files ready for use

This architecture allows:
- Easy addition of new agent formats
- Consistent parsing logic
- Testable conversion layers
