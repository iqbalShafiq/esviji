import { createAgent, tool, toolStrategy } from 'langchain';
import { z } from 'zod/v4';
import { validateSvg, renderSvg } from '@svg-builder/svg-core';
import type { CreativeBrief, LayoutBlueprint, StyleSystem } from '@svg-builder/shared';
import { createLangChainChatModel, type LangChainModelConfig } from './langChainModelFactory.js';
import { inspectSvgStructure } from './svgStructureInspector.js';

const SvgRepairResponseSchema = z.object({
  svg: z.string().describe('The complete corrected SVG markup.'),
});

type StreamMode = 'updates' | 'messages' | 'tools';
type AgentStreamChunk =
  | [StreamMode, unknown]
  | Record<string, unknown>;

type MessageChunk = {
  text?: string;
  content?: unknown;
  contentBlocks?: Array<Record<string, unknown>>;
  tool_call_chunks?: Array<Record<string, unknown>>;
  toolCallChunks?: Array<Record<string, unknown>>;
  tool_calls?: Array<Record<string, unknown>>;
  toolCalls?: Array<Record<string, unknown>>;
};

export interface SvgRepairAgentInput {
  brief: CreativeBrief;
  styleSystem: StyleSystem;
  layout: LayoutBlueprint;
  previousSvg: string;
  errorContext: string;
  revisionInstruction?: string;
  width: number;
  height: number;
  onToken?: (token: string) => void;
  onReasoning?: (token: string) => void;
  onToolEvent?: (message: string) => void;
}

export class SvgRepairAgentService {
  constructor(private modelConfig: LangChainModelConfig) {}

  async repair(input: SvgRepairAgentInput): Promise<string> {
    const tools = this.createTools(input);
    const agent = createAgent({
      model: createLangChainChatModel(this.modelConfig, { temperature: 0.15, maxRetries: 0, useResponsesApi: false }),
      tools,
      responseFormat: toolStrategy(SvgRepairResponseSchema),
      prompt: this.buildSystemPrompt(),
    } as unknown as Parameters<typeof createAgent>[0]);

    const stream = await agent.stream(
      {
        messages: [
          {
            role: 'user',
            content: this.buildUserPrompt(input),
          },
        ],
      },
      { streamMode: ['updates', 'messages', 'tools'], recursionLimit: 12 }
    );

    let structured: z.infer<typeof SvgRepairResponseSchema> | undefined;
    const announcedToolCalls = new Set<string>();

    for await (const chunk of stream as AsyncIterable<AgentStreamChunk>) {
      const [mode, payload] = normalizeStreamChunk(chunk);

      if (mode === 'messages') {
        const message = Array.isArray(payload) ? payload[0] : payload;
        this.forwardMessageChunk(message as MessageChunk, input, announcedToolCalls);
        continue;
      }

      if (mode === 'tools') {
        this.forwardToolLifecycle(payload, input.onToolEvent);
        continue;
      }

      if (mode === 'updates') {
        this.forwardUpdateToolCalls(payload, input.onToolEvent, announcedToolCalls);
        structured = readStructuredResponse(payload) ?? structured;
      }
    }

    const svg = structured?.svg?.trim();

    if (!svg) {
      throw new Error('SVG repair agent did not return a structured svg response.');
    }

    return stripSvgCodeFence(svg);
  }

  private createTools(input: SvgRepairAgentInput) {
    const validateSvgTool = tool(
      ({ svg }) => JSON.stringify(validateSvg(svg), null, 2),
      {
        name: 'validate_svg',
        description: 'Validate and sanitize SVG markup. Use this before returning a final SVG.',
        schema: z.object({
          svg: z.string().describe('Complete SVG markup to validate.'),
        }),
      }
    );

    const renderSvgTool = tool(
      async ({ svg }) => {
        try {
          await renderSvg(svg, input.width, input.height);
          return JSON.stringify({ ok: true }, null, 2);
        } catch (error) {
          return JSON.stringify(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            null,
            2
          );
        }
      },
      {
        name: 'render_svg',
        description: 'Preflight render SVG markup with Resvg. Returns render errors if the SVG cannot render.',
        schema: z.object({
          svg: z.string().describe('Complete SVG markup to render.'),
        }),
      }
    );

    const inspectSvgTool = tool(
      ({ svg }) => JSON.stringify(inspectSvgStructure(svg), null, 2),
      {
        name: 'inspect_svg_structure',
        description:
          'Inspect SVG structure, layer ids, shape counts, colors, blocked elements, and low-complexity risk.',
        schema: z.object({
          svg: z.string().describe('Complete SVG markup to inspect.'),
        }),
      }
    );

    return [validateSvgTool, renderSvgTool, inspectSvgTool];
  }

  private buildSystemPrompt(): string {
    return `You are a senior SVG repair engineer working inside a deterministic SVG generation pipeline.

You may use tools to inspect, validate, and preflight-render SVG. Your final response must be structured and include a complete corrected SVG.

Rules:
- Fix the specific validation, render, structure, and quality errors provided by the pipeline.
- Always keep the SVG safe: no script, style, foreignObject, image, external URLs, data URLs, or event handlers.
- Preserve or improve the creative brief, style system, and layout intent.
- Use named <g id="..."> groups for meaningful layers.
- Keep all important artwork inside the viewBox with comfortable padding.
- Do not return markdown fences or explanations inside the SVG string.
- Use the tools before finalizing whenever there are technical errors.`;
  }

  private buildUserPrompt(input: SvgRepairAgentInput): string {
    return `Repair this SVG so it passes validation, renders successfully, and improves visual quality.

Creative brief:
${JSON.stringify(input.brief, null, 2)}

Style system:
${JSON.stringify(input.styleSystem, null, 2)}

Layout blueprint:
${JSON.stringify(input.layout, null, 2)}

Canvas: ${input.width}x${input.height}
${input.revisionInstruction ? `Revision instruction:\n${input.revisionInstruction}\n` : ''}
Pipeline error context:
${input.errorContext}

Previous SVG:
${input.previousSvg}`;
  }

  private forwardMessageChunk(
    message: MessageChunk,
    input: SvgRepairAgentInput,
    announcedToolCalls: Set<string>
  ): void {
    const reasoning = extractReasoning(message);
    const text = extractText(message);

    if (reasoning) {
      input.onReasoning?.(reasoning);
    }
    if (text) {
      input.onToken?.(text);
    }

    for (const toolCall of extractToolCallChunks(message)) {
      const key = toolCall.id ?? `${toolCall.name}:${toolCall.index ?? ''}`;
      if (!toolCall.name || announcedToolCalls.has(key)) {
        continue;
      }
      announcedToolCalls.add(key);
      input.onToolEvent?.(`Repair tool requested: ${toolCall.name}`);
    }
  }

  private forwardToolLifecycle(payload: unknown, onToolEvent?: (message: string) => void): void {
    if (!onToolEvent || !payload || typeof payload !== 'object') {
      return;
    }

    const event = payload as Record<string, unknown>;
    const name = typeof event.name === 'string' ? event.name : 'unknown';
    switch (event.event) {
      case 'on_tool_start':
        onToolEvent(`Calling repair tool: ${name}`);
        break;
      case 'on_tool_end':
        onToolEvent(`Repair tool completed: ${name}`);
        break;
      case 'on_tool_error':
        onToolEvent(`Repair tool failed: ${name}`);
        break;
      default:
        break;
    }
  }

  private forwardUpdateToolCalls(
    payload: unknown,
    onToolEvent: ((message: string) => void) | undefined,
    announcedToolCalls: Set<string>
  ): void {
    if (!onToolEvent) {
      return;
    }

    for (const message of readMessagesFromUpdate(payload)) {
      for (const toolCall of extractToolCallChunks(message)) {
        const key = toolCall.id ?? `${toolCall.name}:${toolCall.index ?? ''}`;
        if (!toolCall.name || announcedToolCalls.has(key)) {
          continue;
        }
        announcedToolCalls.add(key);
        onToolEvent(`Repair tool requested: ${toolCall.name}`);
      }
    }
  }
}

function normalizeStreamChunk(chunk: AgentStreamChunk): [StreamMode, unknown] {
  if (Array.isArray(chunk)) {
    return chunk;
  }
  return ['updates', chunk];
}

function readStructuredResponse(payload: unknown): z.infer<typeof SvgRepairResponseSchema> | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const root = payload as Record<string, unknown>;
  const direct = readRecord(root.structuredResponse);
  if (direct && typeof direct.svg === 'string') {
    return { svg: direct.svg };
  }

  for (const value of Object.values(root)) {
    const node = readRecord(value);
    const nested = readRecord(node?.structuredResponse);
    if (nested && typeof nested.svg === 'string') {
      return { svg: nested.svg };
    }
  }

  return undefined;
}

function extractText(message: MessageChunk): string {
  if (typeof message.text === 'string' && message.text.length > 0) {
    return message.text;
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        const record = readRecord(part);
        return record?.type === 'text' && typeof record.text === 'string' ? record.text : '';
      })
      .join('');
  }

  if (Array.isArray(message.contentBlocks)) {
    return message.contentBlocks
      .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
      .join('');
  }

  return '';
}

function extractReasoning(message: MessageChunk): string {
  if (!Array.isArray(message.contentBlocks)) {
    return '';
  }

  return message.contentBlocks
    .map((block) => {
      if (block.type !== 'reasoning') return '';
      if (typeof block.reasoning === 'string') return block.reasoning;
      if (typeof block.text === 'string') return block.text;
      return '';
    })
    .join('');
}

function extractToolCallChunks(message: MessageChunk): Array<{ id?: string; name?: string; index?: unknown }> {
  const raw =
    message.tool_call_chunks ??
    message.toolCallChunks ??
    message.tool_calls ??
    message.toolCalls ??
    [];

  return raw
    .map((toolCall) => {
      const name = typeof toolCall.name === 'string' ? toolCall.name : undefined;
      const id = typeof toolCall.id === 'string' ? toolCall.id : undefined;
      return { id, name, index: toolCall.index };
    })
    .filter((toolCall) => toolCall.name || toolCall.id);
}

function readMessagesFromUpdate(payload: unknown): MessageChunk[] {
  const messages: MessageChunk[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = value as Record<string, unknown>;
    if (isMessageLike(record)) {
      messages.push(record as MessageChunk);
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') {
        visit(nested);
      }
    }
  };

  visit(payload);
  return messages;
}

function isMessageLike(record: Record<string, unknown>): boolean {
  return (
    'content' in record ||
    'contentBlocks' in record ||
    'tool_calls' in record ||
    'toolCalls' in record ||
    'tool_call_chunks' in record ||
    'toolCallChunks' in record
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stripSvgCodeFence(svg: string): string {
  let cleaned = svg.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift();
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
  }
  return cleaned;
}
