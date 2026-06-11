#!/usr/bin/env node
/**
 * CLI tool to generate AI agent tool definitions from OpenAPI specs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'js-yaml';
import { parseOpenAPISpec } from '../tools/openapi-parser.js';
import { convertMultipleToOpenAI } from '../tools/openai-converter.js';
import { convertMultipleToAnthropic } from '../tools/anthropic-converter.js';

interface CLIOptions {
  input: string;
  output: string;
  format: 'openai' | 'anthropic' | 'both';
  pretty?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const options: Partial<CLIOptions> = {
    format: 'both',
    pretty: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-f':
      case '--format':
        options.format = args[++i] as CLIOptions['format'];
        break;
      case '--no-pretty':
        options.pretty = false;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  if (!options.input || !options.output) {
    console.error('Error: --input and --output are required\n');
    printHelp();
    process.exit(1);
  }

  return options as CLIOptions;
}

function printHelp(): void {
  console.log(`
Usage: generate-tools [options]

Generate AI agent tool definitions from OpenAPI specifications

Options:
  -i, --input <file>     Input OpenAPI spec file (JSON or YAML)
  -o, --output <file>    Output file path (without extension)
  -f, --format <format>  Output format: 'openai', 'anthropic', or 'both' (default: 'both')
  --no-pretty            Disable pretty-printing JSON output
  -h, --help             Show this help message

Examples:
  # Generate both OpenAI and Anthropic formats
  generate-tools -i api-spec.yaml -o tools/my-api

  # Generate only OpenAI format
  generate-tools -i api-spec.yaml -o tools/my-api -f openai

  # Generate Anthropic format without pretty-printing
  generate-tools -i api-spec.json -o tools/my-api -f anthropic --no-pretty
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  try {
    // Read and parse input file
    console.log(`Reading OpenAPI spec from: ${options.input}`);
    const inputPath = resolve(options.input);
    const fileContent = readFileSync(inputPath, 'utf-8');

    let spec;
    if (inputPath.endsWith('.json')) {
      spec = JSON.parse(fileContent);
    } else if (inputPath.endsWith('.yaml') || inputPath.endsWith('.yml')) {
      spec = yaml.load(fileContent);
    } else {
      // Try to parse as JSON
      spec = JSON.parse(fileContent);
    }

    // Parse OpenAPI spec
    console.log('Parsing OpenAPI specification...');
    const genericTools = parseOpenAPISpec(spec);
    console.log(`Found ${genericTools.length} operations`);

    const indent = options.pretty ? 2 : 0;

    // Generate OpenAI format
    if (options.format === 'openai' || options.format === 'both') {
      const openaiTools = convertMultipleToOpenAI(genericTools);
      const outputPath = `${options.output}.openai.json`;
      writeFileSync(outputPath, JSON.stringify(openaiTools, null, indent));
      console.log(`✓ Generated OpenAI tools: ${outputPath}`);
    }

    // Generate Anthropic format
    if (options.format === 'anthropic' || options.format === 'both') {
      const anthropicTools = convertMultipleToAnthropic(genericTools);
      const outputPath = `${options.output}.anthropic.json`;
      writeFileSync(outputPath, JSON.stringify(anthropicTools, null, indent));
      console.log(`✓ Generated Anthropic tools: ${outputPath}`);
    }

    console.log('\n✨ Tool definitions generated successfully!');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
