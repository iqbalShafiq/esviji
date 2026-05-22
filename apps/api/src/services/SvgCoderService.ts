import { LlmProvider, buildSvgCoderPrompt } from '@svg-builder/ai-core';
import type { CreativeBrief, StyleSystem, LayoutBlueprint } from '@svg-builder/shared';

const MAX_SVG_CODER_RETRIES = 3;

export class SvgCoderService {
  constructor(private llmProvider: LlmProvider) {}

  async code(
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    layout: LayoutBlueprint,
    options?: {
      previousSvg?: string;
      revisionInstruction?: string;
      previousErrorContext?: string;
      onToken?: (token: string) => void;
      onReasoning?: (token: string) => void;
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
    }
  ): Promise<string> {
    const generate = async (revisionInstruction?: string, previousErrorContext?: string): Promise<string> => {
      const { system, user } = buildSvgCoderPrompt({
        brief,
        styleSystem,
        layout,
        revisionInstruction,
        previousErrorContext,
        previousSvg: options?.previousSvg,
      });

      const svg = await this.llmProvider.generateText(system, user, {
        temperature: 0.6,
        maxTokens: 4096,
        reasoningEffort: 'medium',
        onToken: options?.onToken,
        onReasoning: options?.onReasoning,
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

    let cleaned = '';
    const errors: Error[] = [];

    for (let attempt = 0; attempt <= MAX_SVG_CODER_RETRIES; attempt++) {
      const retryContext = [
        options?.previousErrorContext,
        ...errors.map((error, index) => `Attempt ${index + 1} failed: ${error.message}`),
      ]
        .filter(Boolean)
        .join('\n');

      try {
        cleaned = await generate(options?.revisionInstruction, retryContext || undefined);
        if (!this.looksLikeSvg(cleaned)) {
          throw new Error('Output did not start with an <svg> root element.');
        }
        this.assertRevisionContract(cleaned, options?.revisionInstruction);
        break;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        errors.push(normalized);

        if (attempt >= MAX_SVG_CODER_RETRIES) {
          throw new Error(
            `Failed to generate SVG after ${MAX_SVG_CODER_RETRIES + 1} attempt(s): ${normalized.message}`
          );
        }
      }
    }

    if (this.isLowComplexitySvg(cleaned)) {
      const complexityErrors: Error[] = [
        new Error(
          'SVG was too low-complexity: likely too few groups/shapes or too much default black fill.'
        ),
      ];

      for (let attempt = 0; attempt <= MAX_SVG_CODER_RETRIES; attempt++) {
        const retryContext = [
          options?.previousErrorContext,
          [...errors, ...complexityErrors]
            .map((error, index) => `Attempt ${index + 1} failed: ${error.message}`)
            .join('\n'),
        ]
          .filter(Boolean)
          .join('\n');

        try {
          cleaned = await generate(
            `${options?.revisionInstruction ?? ''}\nAvoid a single blob shape. Use at least 3 major groups/layers, 4+ visible primitives/paths, and distinct colors from the style palette. Keep composition readable and meaningful.`,
            retryContext
          );

          if (!this.looksLikeSvg(cleaned)) {
            throw new Error('Output did not start with an <svg> root element.');
          }
          this.assertRevisionContract(cleaned, options?.revisionInstruction);

          if (!this.isLowComplexitySvg(cleaned)) {
            break;
          }
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          complexityErrors.push(normalized);
        }

        complexityErrors.push(new Error('Retry still produced a low-complexity or non-SVG result.'));

        if (attempt >= MAX_SVG_CODER_RETRIES) {
          throw new Error(
            `Failed to generate sufficiently detailed SVG after ${MAX_SVG_CODER_RETRIES + 1} attempt(s).`
          );
        }
      }
    }

    return cleaned;
  }

  private looksLikeSvg(svg: string): boolean {
    return /^<svg\b/i.test(svg.trim());
  }

  private isLowComplexitySvg(svg: string): boolean {
    const groupCount = (svg.match(/<g\b/gi) || []).length;
    const pathCount = (svg.match(/<path\b/gi) || []).length;
    const shapeCount =
      (svg.match(/<(rect|circle|ellipse|polygon|polyline|line)\b/gi) || []).length + pathCount;
    const blackFillCount = (svg.match(/fill=["']#0{3,6}["']/gi) || []).length;
    return groupCount < 2 || shapeCount < 3 || (shapeCount <= 4 && blackFillCount >= 1);
  }

  private assertRevisionContract(svg: string, revisionInstruction?: string): void {
    if (!revisionInstruction) return;

    if (/full_regenerate/i.test(revisionInstruction)) {
      const shapeCount = (svg.match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/gi) || []).length;
      const groupCount = (svg.match(/<g\b/gi) || []).length;
      if (shapeCount < 6 || groupCount < 3) {
        throw new Error(
          'Full regeneration did not produce enough meaningful geometry to satisfy the revision contract.'
        );
      }
    }

    const avoidRepeating = this.extractStringArrayFromRevision(revisionInstruction, 'avoidRepeating');
    if (avoidRepeating.length === 0) return;

    const normalizedSvg = svg.toLowerCase();
    const repeated = avoidRepeating.filter((item) => {
      const normalizedItem = item.toLowerCase().trim();
      return normalizedItem.length >= 16 && normalizedSvg.includes(normalizedItem);
    });

    if (repeated.length > 0) {
      throw new Error(`Revision repeated forbidden failure pattern(s): ${repeated.slice(0, 2).join('; ')}`);
    }
  }

  private extractStringArrayFromRevision(revisionInstruction: string, key: string): string[] {
    try {
      const parsed = JSON.parse(revisionInstruction) as Record<string, unknown>;
      const value = parsed[key];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
