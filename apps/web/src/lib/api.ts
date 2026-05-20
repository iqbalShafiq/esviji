import axios from "axios";
import { resolveApiAssetUrl } from "./download.js";
import type {
  BuildSvgAssetRequest,
  BuildSvgPackRequest,
  IterateSvgAssetRequest,
  RenderSvgRequest,
  OptimizeSvgRequest,
} from "@svg-builder/shared";
import type { AssetResponse, PackResponse, JobResponse } from "../types/index.js";

type ApiEnvelope<T> = {
  success?: boolean;
  data: T;
};

type RawIteration = {
  iterationNumber?: number;
  iteration?: number;
  svgDraftPath?: string;
  pngPreviewPath?: string;
  scores?: Record<string, number>;
  issues?: AssetResponse["evaluation"] extends infer Evaluation
    ? Evaluation extends { issues?: infer Issues }
      ? Issues
      : never
    : never;
  actionTaken?: AssetResponse["iterations"][number]["revisionPlan"];
};

type RawAsset = {
  id?: string;
  assetId?: string;
  prompt?: string;
  assetType?: string;
  mode?: string;
  style?: string;
  output?: { width?: number; height?: number; formats?: string[] };
  width?: number;
  height?: number;
  status?: string;
  currentStage?: string;
  pipelineStages?: AssetResponse["pipelineStages"];
  classification?: AssetResponse["classification"];
  brief?: AssetResponse["brief"];
  styleSystem?: AssetResponse["styleSystem"];
  layoutBlueprint?: AssetResponse["layoutBlueprint"];
  finalSvg?: string;
  finalSvgPath?: string;
  finalPngPath?: string;
  iterations?: RawIteration[];
  evaluation?: AssetResponse["evaluation"];
  qualityGates?: AssetResponse["qualityGates"];
  createdAt?: string;
  updatedAt?: string;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  headers: {
    "Content-Type": "application/json",
  },
});

export async function buildSvgAsset(
  data: BuildSvgAssetRequest
): Promise<{ jobId: string }> {
  const res = await api.post<ApiEnvelope<{ jobId: string }>>(
    "/api/assets/svg/build",
    data
  );
  const payload = unwrapEnvelope(res.data);
  return { jobId: payload.jobId };
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await api.get<ApiEnvelope<JobResponse>>(`/api/jobs/${jobId}`);
  return unwrapEnvelope(res.data);
}

export function subscribeJobStream(
  jobId: string,
  handlers: {
    onJob: (job: JobResponse) => void;
    onFlow?: (flow: { stage: string; message: string; at: string; progress?: number }) => void;
    onModelToken?: (event: { stage: string; content: string; at: string; sequence: number }) => void;
    onReasoning?: (event: { stage: string; content: string; at: string; sequence: number }) => void;
    onTool?: (event: {
      stage: string;
      type: "tool";
      content: string;
      at: string;
      sequence: number;
      toolName?: string;
      toolStatus?: "requested" | "running" | "completed" | "failed";
    }) => void;
    onClearStream?: (event: { stage: string; content: string; at: string; sequence: number }) => void;
    onError?: (error: string) => void;
  }
): () => void {
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  const source = new EventSource(`${base}/api/jobs/${jobId}/stream`);

  source.addEventListener("job", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as JobResponse;
      handlers.onJob(data);
    } catch {
      handlers.onError?.("Failed to parse SSE payload");
    }
  });

  source.addEventListener("error", (event) => {
    const payload = (event as MessageEvent).data;
    if (typeof payload === "string" && payload.length > 0) {
      handlers.onError?.(payload);
    }
  });

  source.addEventListener("flow", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as {
        stage: string;
        message: string;
        at: string;
        progress?: number;
      };
      handlers.onFlow?.(data);
    } catch {
      handlers.onError?.("Failed to parse flow event");
    }
  });

  source.addEventListener("model", (event) => {
    try {
      handlers.onModelToken?.(JSON.parse((event as MessageEvent).data));
    } catch {
      handlers.onError?.("Failed to parse model stream event");
    }
  });

  source.addEventListener("reasoning", (event) => {
    try {
      handlers.onReasoning?.(JSON.parse((event as MessageEvent).data));
    } catch {
      handlers.onError?.("Failed to parse reasoning stream event");
    }
  });

  source.addEventListener("tool", (event) => {
    try {
      handlers.onTool?.(JSON.parse((event as MessageEvent).data));
    } catch {
      handlers.onError?.("Failed to parse tool stream event");
    }
  });

  source.addEventListener("clear", (event) => {
    try {
      handlers.onClearStream?.(JSON.parse((event as MessageEvent).data));
    } catch {
      handlers.onError?.("Failed to parse stream clear event");
    }
  });

  source.onerror = () => {
    handlers.onError?.("SSE connection error");
  };

  return () => {
    source.close();
  };
}

export async function buildSvgPack(
  data: BuildSvgPackRequest
): Promise<{ jobId: string }> {
  const res = await api.post<ApiEnvelope<{ jobId: string }>>("/api/assets/svg-pack/build", data);
  const payload = unwrapEnvelope(res.data);
  return { jobId: payload.jobId };
}

export async function iterateSvgAsset(
  data: IterateSvgAssetRequest
): Promise<AssetResponse> {
  const res = await api.post<ApiEnvelope<{ assetId?: string } & RawAsset>>(
    "/api/assets/svg/iterate",
    data
  );
  const payload = unwrapEnvelope(res.data);

  if (payload.assetId) {
    return getAsset(payload.assetId);
  }

  const finalSvg = await fetchSvgContent(payload.finalSvgPath);
  return normalizeAsset(payload, finalSvg);
}

export async function renderSvg(data: RenderSvgRequest): Promise<{ pngUrl: string }> {
  const res = await api.post("/api/assets/svg/render", data);
  return res.data;
}

export async function optimizeSvg(data: OptimizeSvgRequest): Promise<{ svg: string }> {
  const res = await api.post("/api/assets/svg/optimize", data);
  return res.data;
}

export interface AssetListItem {
  id: string;
  name?: string | null;
  prompt: string;
  assetType: string;
  mode: string;
  style?: string | null;
  status: string;
  width: number;
  height: number;
  currentIteration: number;
  bestIterationNumber?: number | null;
  finalPngPath?: string | null;
  createdAt: string;
  updatedAt: string;
  latestScores: Record<string, number>;
  latestPngPreviewPath?: string;
}

export async function listAssets(): Promise<AssetListItem[]> {
  const res = await api.get<ApiEnvelope<AssetListItem[]>>('/api/assets');
  return unwrapEnvelope(res.data);
}

export async function getAsset(assetId: string): Promise<AssetResponse> {
  const res = await api.get<ApiEnvelope<RawAsset>>(`/api/assets/${assetId}`);
  const raw = unwrapEnvelope(res.data);
  const finalSvg = await fetchSvgContent(raw.finalSvgPath);
  return normalizeAsset(raw, finalSvg);
}

export async function getPack(packId: string): Promise<PackResponse> {
  const res = await api.get(`/api/packs/${packId}`);
  return res.data;
}

export default api;

function unwrapEnvelope<T>(payload: ApiEnvelope<T> | T): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

async function fetchSvgContent(path?: string): Promise<string | undefined> {
  if (!path || typeof path !== "string") return undefined;
  try {
    const res = await api.get(path, { responseType: "text" });
    return typeof res.data === "string" ? res.data : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAsset(raw: RawAsset, finalSvg?: string): AssetResponse {
  const createdAt = raw.createdAt ?? new Date().toISOString();
  const updatedAt = raw.updatedAt ?? createdAt;

  const status =
    raw.status === "processing"
      ? "building"
      : raw.status === "pending" ||
        raw.status === "building" ||
        raw.status === "completed" ||
        raw.status === "failed"
      ? raw.status
      : "pending";

  const iterations = Array.isArray(raw.iterations)
    ? raw.iterations.map((it, index) => ({
        iteration: it.iterationNumber ?? it.iteration ?? index + 1,
        svg: it.svgDraftPath,
        pngUrl: it.pngPreviewPath ? resolveApiAssetUrl(it.pngPreviewPath) : undefined,
        scores: it.scores,
        issues: Array.isArray(it.issues) ? it.issues : [],
        revisionPlan: it.actionTaken,
      }))
    : [];

  const lastIteration = iterations.length > 0 ? iterations[iterations.length - 1] : undefined;

  return {
    id: raw.id ?? raw.assetId ?? "",
    prompt: raw.prompt ?? "",
    assetType: raw.assetType ?? "icon",
    mode: raw.mode ?? "direct",
    style: raw.style,
    output: {
      width: raw.output?.width ?? raw.width ?? 512,
      height: raw.output?.height ?? raw.height ?? 512,
      formats: raw.output?.formats ?? ["svg", "png"],
    },
    status,
    currentStage: raw.currentStage,
    pipelineStages: raw.pipelineStages,
    classification: raw.classification,
    brief: raw.brief,
    styleSystem: raw.styleSystem,
    layoutBlueprint: raw.layoutBlueprint,
    finalSvg: finalSvg ?? raw.finalSvg,
    finalPngUrl: raw.finalPngPath ? resolveApiAssetUrl(raw.finalPngPath) : undefined,
    iterations,
    evaluation: raw.evaluation ??
      (lastIteration
        ? { scores: lastIteration.scores ?? {}, issues: lastIteration.issues ?? [], continueIteration: false }
        : undefined),
    qualityGates: raw.qualityGates,
    createdAt,
    updatedAt,
  };
}
