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
  logs: Array<{ stage: string; message: string; at: string; progress?: number }>;
  error?: string;
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
