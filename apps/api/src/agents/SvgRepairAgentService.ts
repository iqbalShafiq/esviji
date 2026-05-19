import { createAgent, tool, toolStrategy } from 'langchain';
import { z } from 'zod/v4';
import { validateSvg, renderSvg } from '@svg-builder/svg-core';
import type { CreativeBrief, LayoutBlueprint, StyleSystem } from '@svg-builder/shared';
import { createLangChainChatModel, type LangChainModelConfig } from './langChainModelFactory.js';
import { inspectSvgStructure } from './svgStructureInspector.js';

const SvgRepairResponseSchema = z.object({
  svg: z.string().describe('The complete corrected SVG markup.'),
});

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
  onToolEvent?: (message: string) => void;
}

export class SvgRepairAgentService {
  constructor(private modelConfig: LangChainModelConfig) {}

  async repair(input: SvgRepairAgentInput): Promise<string> {
    const tools = this.createTools(input);
    const agent = createAgent({
      model: createLangChainChatModel(this.modelConfig, { temperature: 0.15, maxRetries: 0 }),
      tools,
      responseFormat: toolStrategy(SvgRepairResponseSchema),
      prompt: this.buildSystemPrompt(),
    } as any);

    const run = await agent.streamEvents(
      {
        messages: [
          {
            role: 'user',
            content: this.buildUserPrompt(input),
          },
        ],
      },
      { version: 'v3', recursionLimit: 12 }
    );

    await Promise.all([
      this.forwardMessageTokens(run.messages, input.onToken),
      this.forwardToolEvents(run.toolCalls, input.onToolEvent),
    ]);

    const output = await run.output;
    const structured = output.structuredResponse as z.infer<typeof SvgRepairResponseSchema> | undefined;
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

  private async forwardMessageTokens(messages: any, onToken?: (token: string) => void): Promise<void> {
    if (!onToken) return;
    for await (const message of messages) {
      for await (const token of message.text) {
        onToken(token);
      }
    }
  }

  private async forwardToolEvents(toolCalls: any, onToolEvent?: (message: string) => void): Promise<void> {
    if (!onToolEvent) return;
    for await (const call of toolCalls) {
      onToolEvent(`Calling repair tool: ${call.name}`);
      await call.output;
      onToolEvent(`Repair tool completed: ${call.name}`);
    }
  }
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
