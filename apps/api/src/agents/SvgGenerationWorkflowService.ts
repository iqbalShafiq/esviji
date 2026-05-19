import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { renderSvg, validateSvg, type SvgValidationResult } from '@svg-builder/svg-core';
import type { CreativeBrief, LayoutBlueprint, StyleSystem } from '@svg-builder/shared';
import { inspectSvgStructure } from './svgStructureInspector.js';
import { SvgRepairAgentService } from './SvgRepairAgentService.js';

const MAX_GRAPH_REPAIRS = 3;

const WorkflowState = Annotation.Root({
  svg: Annotation<string>(),
  validation: Annotation<SvgValidationResult | undefined>(),
  renderable: Annotation<boolean>(),
  errorContext: Annotation<string>(),
  repairCount: Annotation<number>(),
});

export interface SvgGenerationWorkflowInput {
  brief: CreativeBrief;
  styleSystem: StyleSystem;
  layout: LayoutBlueprint;
  width: number;
  height: number;
  initialSvg: string;
  revisionInstruction?: string;
  onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
  onToken?: (token: string) => void;
  onToolEvent?: (message: string) => void;
}

export interface SvgGenerationWorkflowResult {
  svg: string;
  validationSummary: { valid: boolean; errors: string[]; warnings: string[] };
}

export class SvgGenerationWorkflowService {
  constructor(private repairAgent: SvgRepairAgentService) {}

  async run(input: SvgGenerationWorkflowInput): Promise<SvgGenerationWorkflowResult> {
    const graph = new StateGraph(WorkflowState)
      .addNode('validate', async (state) => this.validateNode(state.svg))
      .addNode('preflight_render', async (state) => this.preflightRenderNode(state.svg, input.width, input.height))
      .addNode('repair_agent', async (state) => this.repairNode(state, input))
      .addEdge(START, 'validate')
      .addConditionalEdges('validate', (state) => this.routeAfterValidation(state), ['preflight_render', 'repair_agent', END])
      .addConditionalEdges(
        'preflight_render',
        (state) => (state.renderable || state.repairCount >= MAX_GRAPH_REPAIRS ? END : 'repair_agent'),
        ['repair_agent', END]
      )
      .addEdge('repair_agent', 'validate')
      .compile();

    const result = await graph.invoke({
      svg: input.initialSvg,
      validation: undefined,
      renderable: false,
      errorContext: '',
      repairCount: 0,
    });

    if (!this.isValidationValid(result.validation) || !result.renderable) {
      throw new Error(
        `SVG LangGraph workflow failed after ${MAX_GRAPH_REPAIRS} repair attempt(s): ${
          result.errorContext || 'unknown error'
        }`
      );
    }

    const validation = result.validation as SvgValidationResult;
    return {
      svg: validation.sanitizedSvg || result.svg,
      validationSummary: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    };
  }

  private validateNode(svg: string): { validation: SvgValidationResult; errorContext: string } {
    const validation = validateSvg(svg);
    const structure = inspectSvgStructure(svg);
    const structureIssues: string[] = [];

    if (structure.likelyLowComplexity) {
      structureIssues.push('SVG is likely too low-complexity for production quality.');
    }
    if (structure.hasBlockedElements) {
      structureIssues.push('SVG contains blocked elements.');
    }
    if (structure.hasExternalReferences) {
      structureIssues.push('SVG contains external references.');
    }

    return {
      validation,
      errorContext: [
        validation.valid ? '' : `Validation failed: ${validation.errors.join('; ')}`,
        validation.warnings.length ? `Validation warnings: ${validation.warnings.join('; ')}` : '',
        structureIssues.join('\n'),
        structureIssues.length ? `Structure inspection: ${JSON.stringify(structure)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private async preflightRenderNode(
    svg: string,
    width: number,
    height: number
  ): Promise<{ renderable: boolean; errorContext?: string }> {
    try {
      await renderSvg(svg, width, height);
      return { renderable: true };
    } catch (error) {
      return {
        renderable: false,
        errorContext: `Render failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async repairNode(
    state: typeof WorkflowState.State,
    input: SvgGenerationWorkflowInput
  ): Promise<{ svg: string; repairCount: number; renderable: boolean; errorContext?: string }> {
    const nextRepairCount = state.repairCount + 1;
    const error = new Error(state.errorContext || 'SVG failed validation or render preflight.');
    input.onRetry?.(nextRepairCount, MAX_GRAPH_REPAIRS, error);

    let svg = state.svg;
    let errorContext = state.errorContext;
    try {
      svg = await this.repairAgent.repair({
        brief: input.brief,
        styleSystem: input.styleSystem,
        layout: input.layout,
        previousSvg: state.svg,
        errorContext: state.errorContext,
        revisionInstruction: input.revisionInstruction,
        width: input.width,
        height: input.height,
        onToken: input.onToken,
        onToolEvent: input.onToolEvent,
      });
      errorContext = '';
    } catch (repairError) {
      errorContext = [
        state.errorContext,
        `Repair agent failed: ${repairError instanceof Error ? repairError.message : String(repairError)}`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return {
      svg,
      repairCount: nextRepairCount,
      renderable: false,
      errorContext,
    };
  }

  private isValidationValid(validation: unknown): validation is SvgValidationResult {
    return Boolean(validation && typeof validation === 'object' && (validation as SvgValidationResult).valid);
  }

  private routeAfterValidation(state: typeof WorkflowState.State): 'preflight_render' | 'repair_agent' | typeof END {
    const hasQualityOrTechnicalContext = state.errorContext.trim().length > 0;
    if (this.isValidationValid(state.validation) && !hasQualityOrTechnicalContext) {
      return 'preflight_render';
    }
    if (state.repairCount >= MAX_GRAPH_REPAIRS) {
      return END;
    }
    return 'repair_agent';
  }
}
