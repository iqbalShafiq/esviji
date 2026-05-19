import { LlmProvider, buildSvgCoderPrompt } from '@svg-builder/ai-core';
import type { CreativeBrief, StyleSystem, LayoutBlueprint } from '@svg-builder/shared';

export class SvgCoderService {
  constructor(private llmProvider: LlmProvider) {}

  async code(
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    layout: LayoutBlueprint,
    options?: {
      previousSvg?: string;
      revisionInstruction?: string;
      onToken?: (token: string) => void;
    }
  ): Promise<string> {
    const generate = async (revisionInstruction?: string): Promise<string> => {
      const { system, user } = buildSvgCoderPrompt({
        brief,
        styleSystem,
        layout,
        revisionInstruction,
        previousSvg: options?.previousSvg,
      });

      const svg = await this.llmProvider.generateText(system, user, {
        temperature: 0.6,
        maxTokens: 4096,
        onToken: options?.onToken,
      });

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
    };

    let cleaned = await generate(options?.revisionInstruction);

    if (this.isLowComplexitySvg(cleaned)) {
      cleaned = await generate(
        `${options?.revisionInstruction ?? ''}\nAvoid a single blob shape. Use at least 3 major groups/layers and distinct colors from style palette. Keep composition readable and meaningful.`
      );
    }

    return cleaned;
  }

  private isLowComplexitySvg(svg: string): boolean {
    const groupCount = (svg.match(/<g\b/gi) || []).length;
    const pathCount = (svg.match(/<path\b/gi) || []).length;
    const shapeCount =
      (svg.match(/<(rect|circle|ellipse|polygon|polyline|line)\b/gi) || []).length + pathCount;
    const blackFillCount = (svg.match(/fill=["']#0{3,6}["']/gi) || []).length;
    return groupCount < 2 || shapeCount < 3 || (shapeCount <= 4 && blackFillCount >= 1);
  }
}
