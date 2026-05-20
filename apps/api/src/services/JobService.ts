import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { PipelineStage } from '@svg-builder/shared';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type JobStreamEvent = {
  sequence: number;
  type: 'model' | 'reasoning' | 'clear';
  stage: PipelineStage;
  content: string;
  at: string;
};

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
  stageReasoningStreams?: Partial<Record<PipelineStage, string>>;
  streamEvents?: JobStreamEvent[];
  logs: Array<{ stage: PipelineStage; message: string; at: string; progress?: number }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class JobService {
  private baseDir: string;
  private cache = new Map<string, JobState>();
  private mutationQueues = new Map<string, Promise<void>>();

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
      stageReasoningStreams: {},
      streamEvents: [],
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
    await this.mutate(jobId, (job) => ({
      status: 'running',
      currentStage: stage,
      progress,
      logs: [...job.logs, { stage, message, at: new Date().toISOString(), progress }],
    }));
  }

  async clearStageOutput(jobId: string, stage: PipelineStage): Promise<void> {
    await this.mutate(jobId, (job) => ({
      status: 'running',
      currentStage: stage,
      stageStreams: {
        ...(job.stageStreams ?? {}),
        [stage]: '',
      },
      stageReasoningStreams: {
        ...(job.stageReasoningStreams ?? {}),
        [stage]: '',
      },
      streamEvents: this.appendStreamEvent(job, 'clear', stage, ''),
    }));
  }

  async ensureStage(jobId: string, stage: PipelineStage): Promise<void> {
    await this.mutate(jobId, (job) => {
      if (job.currentStage === stage) return {};
      return { status: 'running', currentStage: stage };
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
    await this.mutate(jobId, (job) => {
      const current = job.stageStreams?.[stage] ?? '';
      const next = (current + token).slice(-4000);
      return {
        status: 'running',
        currentStage: stage,
        stageStreams: {
          ...(job.stageStreams ?? {}),
          [stage]: next,
        },
        streamEvents: this.appendStreamEvent(job, 'model', stage, token),
      };
    });
  }

  async appendStageReasoning(jobId: string, stage: PipelineStage, message: string): Promise<void> {
    await this.mutate(jobId, (job) => {
      const current = job.stageReasoningStreams?.[stage] ?? '';
      const next = (current + message).slice(-5000);
      return {
        status: 'running',
        currentStage: stage,
        stageReasoningStreams: {
          ...(job.stageReasoningStreams ?? {}),
          [stage]: next,
        },
        streamEvents: this.appendStreamEvent(job, 'reasoning', stage, message),
      };
    });
  }

  async getStreamEventsAfter(jobId: string, sequence: number): Promise<JobStreamEvent[]> {
    const job = await this.get(jobId);
    if (!job) return [];
    return (job.streamEvents ?? []).filter((event) => event.sequence > sequence);
  }

  private async update(jobId: string, patch: Partial<JobState>): Promise<void> {
    await this.mutate(jobId, () => patch);
  }

  private async mutate(jobId: string, producer: (job: JobState) => Partial<JobState>): Promise<void> {
    const previous = this.mutationQueues.get(jobId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const job = await this.get(jobId);
      if (!job) return;
      const patch = producer(job);
      await this.persist({ ...job, ...patch, updatedAt: new Date().toISOString() });
    });
    this.mutationQueues.set(jobId, next.catch(() => undefined));
    await next;
  }

  private async persist(job: JobState): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    this.cache.set(job.jobId, job);
    await writeFile(this.getJobPath(job.jobId), JSON.stringify(job, null, 2), 'utf-8');
  }

  private appendStreamEvent(
    job: JobState,
    type: JobStreamEvent['type'],
    stage: PipelineStage,
    content: string
  ): JobStreamEvent[] {
    const events = job.streamEvents ?? [];
    const lastSequence = events[events.length - 1]?.sequence ?? 0;
    return [
      ...events,
      {
        sequence: lastSequence + 1,
        type,
        stage,
        content,
        at: new Date().toISOString(),
      },
    ].slice(-1000);
  }

  private getJobPath(jobId: string): string {
    return path.join(this.baseDir, `${jobId}.json`);
  }
}
