export const PIPELINE_STAGES = [
  "classify",
  "brief",
  "style",
  "layout",
  "svg",
  "render",
  "evaluate",
  "revise",
  "optimize",
  "export",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
