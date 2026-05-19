import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { PipelineStage } from '@svg-builder/shared';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobState {
  jobId: string;
  assetId?: string;
  packId?: string;
  status: JobStatus;
  currentStage?: PipelineStage;
  progress: number;
  latestPreviewUrl?: string;
  latestIteration?: number;
  stageStreams?: Partial<Record<PipelineStage, string>>;
  logs: Array<{ stage: PipelineStage; message: string; at: string; progress?: number }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class JobService {
  private baseDir: string;
  private cache = new Map<string, JobState>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR || './storage', 'jobs');
  }

  async create(input: { jobId: string; assetId?: string; packId?: string }): Promise<JobState> {
    const now = new Date().toISOString();
    const job: JobState = {
      jobId: input.jobId,
      assetId: input.assetId,
      packId: input.packId,
      status: 'queued',
      progress: 0,
      logs: [],
      stageStreams: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.persist(job);
    return job;
  }

  async get(jobId: string): Promise<JobState | undefined> {
    if (this.cache.has(jobId)) return this.cache.get(jobId);
    const filePath = this.getJobPath(jobId);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as JobState;
      this.cache.set(jobId, parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }

  async start(jobId: string): Promise<void> {
    await this.update(jobId, { status: 'running', progress: 5 });
  }

  async stage(jobId: string, stage: PipelineStage, progress: number, message: string): Promise<void> {
    const job = await this.get(jobId);
    if (!job) return;
    await this.persist({
      ...job,
      status: 'running',
      currentStage: stage,
      progress,
      logs: [...job.logs, { stage, message, at: new Date().toISOString(), progress }],
      updatedAt: new Date().toISOString(),
    });
  }

  async complete(jobId: string): Promise<void> {
    await this.update(jobId, { status: 'completed', progress: 100 });
  }

  async attachAsset(jobId: string, assetId: string): Promise<void> {
    await this.update(jobId, { assetId });
  }

  async attachPack(jobId: string, packId: string): Promise<void> {
    await this.update(jobId, { packId });
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.update(jobId, { status: 'failed', error });
  }

  async setLatestPreview(jobId: string, previewUrl: string, iteration: number): Promise<void> {
    await this.update(jobId, { latestPreviewUrl: previewUrl, latestIteration: iteration });
  }

  async appendStageStream(jobId: string, stage: PipelineStage, token: string): Promise<void> {
    const job = await this.get(jobId);
    if (!job) return;
    const current = job.stageStreams?.[stage] ?? '';
    const next = (current + token).slice(-4000);
    await this.update(jobId, {
      stageStreams: {
        ...(job.stageStreams ?? {}),
        [stage]: next,
      },
    });
  }

  private async update(jobId: string, patch: Partial<JobState>): Promise<void> {
    const job = await this.get(jobId);
    if (!job) return;
    await this.persist({ ...job, ...patch, updatedAt: new Date().toISOString() });
  }

  private async persist(job: JobState): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    this.cache.set(job.jobId, job);
    await writeFile(this.getJobPath(job.jobId), JSON.stringify(job, null, 2), 'utf-8');
  }

  private getJobPath(jobId: string): string {
    return path.join(this.baseDir, `${jobId}.json`);
  }
}
