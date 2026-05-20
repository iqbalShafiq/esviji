import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { JobService } from '../src/services/JobService.js';

test('JobService records model and reasoning stream events in order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'svg-job-service-'));
  try {
    const service = new JobService(dir);
    await service.create({ jobId: 'job_stream' });

    await service.appendStageReasoning('job_stream', 'svg', 'thinking about layer balance');
    await service.appendStageStream('job_stream', 'svg', '<svg');

    const events = await service.getStreamEventsAfter('job_stream', 0);

    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((event) => ({ sequence: event.sequence, type: event.type, stage: event.stage })),
      [
        { sequence: 1, type: 'reasoning', stage: 'svg' },
        { sequence: 2, type: 'model', stage: 'svg' },
      ]
    );
    assert.match(events[0].content, /thinking about layer balance/);
    assert.equal(events[1].content, '<svg');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('JobService preserves stage logs while model and reasoning updates stream concurrently', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'svg-job-service-'));
  try {
    const service = new JobService(dir);
    await service.create({ jobId: 'job_concurrent' });

    await Promise.all([
      service.stage('job_concurrent', 'style', 30, 'Building style system'),
      service.appendStageReasoning('job_concurrent', 'style', 'deriving palette'),
      service.appendStageStream('job_concurrent', 'style', '{'),
    ]);

    const job = await service.get('job_concurrent');

    assert.equal(job?.currentStage, 'style');
    assert.equal(job?.logs.length, 1);
    assert.equal(job?.stageStreams?.style, '{');
    assert.match(job?.stageReasoningStreams?.style ?? '', /deriving palette/);
    assert.equal(job?.streamEvents?.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
