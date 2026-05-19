import { LlmProvider, generateStructuredOutput, buildReferenceAnalysisPrompt } from '@svg-builder/ai-core';
import { z } from 'zod';

const ReferenceAnalysisSchema = z.object({
  canvas: z.object({
    width: z.number(),
    height: z.number(),
  }),
  subjectBounds: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  palette: z.array(z.string()),
  styleNotes: z.string(),
});

export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;

export class ReferenceAnalyzerService {
  constructor(private llmProvider: LlmProvider) {}

  async analyze(referenceImageUrl: string, options?: { onToken?: (token: string) => void }): Promise<ReferenceAnalysis> {
    // Download image
    const response = await fetch(referenceImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download reference image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    const { system, user } = buildReferenceAnalysisPrompt({
      imageUrl: referenceImageUrl,
      imageBase64: base64,
    });

    // For MVP, we use the LLM with a text prompt since the LlmProvider interface
    // doesn't support vision. In production, this should use a VisionProvider.
    const analysis = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      ReferenceAnalysisSchema,
      { maxRetries: 2, onToken: options?.onToken }
    );

    return analysis;
  }
}
