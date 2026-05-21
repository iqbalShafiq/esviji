import type {
  AssetTypeClassification,
  CreativeBrief,
  StyleSystem,
  LayoutBlueprint,
  EvaluationResult,
  RevisionPlan,
} from "@svg-builder/shared";

export interface PipelineStageInfo {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface IterationData {
  iteration: number;
  svg?: string;
  pngUrl?: string;
  scores?: Record<string, number>;
  issues: EvaluationResult["issues"];
  revisionPlan?: RevisionPlan;
}

export interface AssetResponse {
  id: string;
  packId?: string | null;
  pack?: PackSummary | null;
  prompt: string;
  assetType: string;
  mode: string;
  style?: string;
  output: {
    width: number;
    height: number;
    formats: string[];
  };
  status: "pending" | "building" | "completed" | "failed";
  currentStage?: string;
  pipelineStages?: PipelineStageInfo[];
  classification?: AssetTypeClassification;
  brief?: CreativeBrief;
  styleSystem?: StyleSystem;
  layoutBlueprint?: LayoutBlueprint;
  finalSvg?: string;
  finalPngUrl?: string;
  iterations: IterationData[];
  evaluation?: EvaluationResult;
  qualityGates?: QualityGateResult[];
  createdAt: string;
  updatedAt: string;
}

export interface JobResponse {
  jobId: string;
  assetId?: string;
  packId?: string;
  status: "queued" | "running" | "completed" | "failed";
  currentStage?: string;
  progress: number;
  latestPreviewUrl?: string;
  latestIteration?: number;
  stageStreams?: Record<string, string>;
  stageReasoningStreams?: Record<string, string>;
  streamEvents?: Array<{
    sequence: number;
    type: "model" | "reasoning" | "tool" | "clear";
    stage: string;
    content: string;
    at: string;
    toolName?: string;
    toolStatus?: "requested" | "running" | "completed" | "failed";
  }>;
  toolEvents?: Array<{
    stage: string;
    name: string;
    status: "requested" | "running" | "completed" | "failed";
    message: string;
    at: string;
    sequence: number;
  }>;
  logs: Array<{ stage: string; message: string; at: string; progress?: number }>;
  error?: string;
}

export interface PackSummary {
  id: string;
  prompt: string;
  assetType: string;
  quantity: number;
  status: string;
  assetCount?: number;
  thumbnails?: PackThumbnail[];
  createdAt: string;
  updatedAt: string;
}

export interface PackThumbnail {
  id: string;
  name?: string | null;
  prompt: string;
  finalPngPath?: string | null;
  finalSvgPath?: string | null;
  width: number;
  height: number;
}

export interface QualityGateResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface PackOutlier {
  assetId: string;
  name: string;
  problem: string;
  suggestedFix?: string;
}

export interface PackResponse {
  id: string;
  prompt: string;
  assetType: string;
  quantity: number;
  status: string;
  style?: string | null;
  assets: AssetResponse[];
  output?: {
    width: number;
    height: number;
    formats: string[];
  };
  consistencyScores?: Record<string, number>;
  sharedStyleSystem?: Record<string, unknown>;
  outliers?: PackOutlier[];
  zipUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type PreviewMode = "final" | "debug" | "raw";
export type BackgroundMode = "transparent" | "white" | "dark" | "blueprint";
export type PreviewSize = "16" | "24" | "48" | "128" | "full";
