import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import path from 'path';
import { OpenAiProvider } from '@svg-builder/ai-core';

import { AssetTypeClassifierService } from './services/AssetTypeClassifierService.js';
import { CreativeBriefBuilderService } from './services/CreativeBriefBuilderService.js';
import { StyleSystemBuilderService } from './services/StyleSystemBuilderService.js';
import { ReferenceAnalyzerService } from './services/ReferenceAnalyzerService.js';
import { AssetPlanningService } from './services/AssetPlanningService.js';
import { LayoutPlannerService } from './services/LayoutPlannerService.js';
import { SvgCoderService } from './services/SvgCoderService.js';
import { SvgValidationService } from './services/SvgValidationService.js';
import { SvgRenderService } from './services/SvgRenderService.js';
import { SvgOptimizerService } from './services/SvgOptimizerService.js';
import { AssetTypeEvaluatorService } from './services/AssetTypeEvaluatorService.js';
import { RevisionPlannerService } from './services/RevisionPlannerService.js';
import { StorageService } from './services/StorageService.js';
import { DebugOverlayService } from './services/DebugOverlayService.js';
import { PackPlannerService } from './services/PackPlannerService.js';
import { PackConsistencyEvaluatorService } from './services/PackConsistencyEvaluatorService.js';
import { ZipExportService } from './services/ZipExportService.js';
import { JobService } from './services/JobService.js';
import { SvgBuildOrchestrator } from './orchestrators/SvgBuildOrchestrator.js';
import { SvgPackBuildOrchestrator } from './orchestrators/SvgPackBuildOrchestrator.js';
import { SvgAssetsController } from './controllers/svgAssets.controller.js';
import { SvgPacksController } from './controllers/svgPacks.controller.js';
import { svgAssetsRoutes } from './routes/svgAssets.routes.js';
import { registerSvgPackRoutes } from './routes/svgPacks.routes.js';
import { SvgRepairAgentService } from './agents/SvgRepairAgentService.js';
import { SvgGenerationWorkflowService } from './agents/SvgGenerationWorkflowService.js';
import { prisma } from './db/prisma.js';

dotenv.config();

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  const storageBaseDir = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR || './storage');

  app.get('/assets/*', async (request, reply) => {
    const wildcardPath = (request.params as { '*': string })['*'];
    const normalized = path.normalize(wildcardPath || '');

    if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid asset path',
      });
      return;
    }

    const absolutePath = path.join(storageBaseDir, 'assets', normalized);
    try {
      const fileBuffer = await readFile(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const contentType =
        ext === '.svg'
          ? 'image/svg+xml; charset=utf-8'
          : ext === '.png'
          ? 'image/png'
          : 'application/octet-stream';

      reply
        .header('Content-Type', contentType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', ext === '.svg' ? 'attachment' : 'inline')
        .send(fileBuffer);
    } catch {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Asset file not found',
      });
    }
  });

  app.get('/packs/*', async (request, reply) => {
    const wildcardPath = (request.params as { '*': string })['*'];
    const normalized = path.normalize(wildcardPath || '');

    if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid pack path',
      });
      return;
    }

    const absolutePath = path.join(storageBaseDir, 'packs', normalized);
    try {
      const fileBuffer = await readFile(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const contentType = ext === '.zip' ? 'application/zip' : 'application/octet-stream';

      reply.header('Content-Type', contentType).send(fileBuffer);
    } catch {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Pack file not found',
      });
    }
  });

  // Initialize LLM provider
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    app.log.warn('OPENAI_API_KEY not set. LLM-dependent features will fail.');
  }
  const llmProvider = new OpenAiProvider(
    apiKey ?? 'no-api-key',
    process.env.OPENAI_MODEL ?? 'google/gemini-3.1-flash-lite',
    process.env.OPENAI_BASE_URL ?? 'https://openrouter.ai/api/v1'
  );
  const langChainModelConfig = {
    apiKey: apiKey ?? 'no-api-key',
    model: process.env.OPENAI_MODEL ?? 'google/gemini-3.1-flash-lite',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://openrouter.ai/api/v1',
  };

  // Initialize services
  const storageService = new StorageService();
  const classifier = new AssetTypeClassifierService(llmProvider);
  const briefBuilder = new CreativeBriefBuilderService(llmProvider);
  const styleBuilder = new StyleSystemBuilderService(llmProvider);
  const referenceAnalyzer = new ReferenceAnalyzerService(llmProvider);
  const assetPlanner = new AssetPlanningService();
  const layoutPlanner = new LayoutPlannerService(llmProvider);
  const svgCoder = new SvgCoderService(llmProvider);
  const svgValidation = new SvgValidationService();
  const svgRender = new SvgRenderService(storageService);
  const svgOptimizer = new SvgOptimizerService();
  const evaluator = new AssetTypeEvaluatorService(llmProvider, langChainModelConfig);
  const revisionPlanner = new RevisionPlannerService(llmProvider);
  const debugOverlay = new DebugOverlayService(storageService);
  const packPlanner = new PackPlannerService(llmProvider);
  const consistencyEvaluator = new PackConsistencyEvaluatorService(llmProvider);
  const zipExport = new ZipExportService(storageService);
  const jobService = new JobService();
  const svgRepairAgent = new SvgRepairAgentService(langChainModelConfig);
  const svgGenerationWorkflow = new SvgGenerationWorkflowService(svgRepairAgent);

  // Initialize orchestrators
  const orchestrator = new SvgBuildOrchestrator(
    classifier,
    briefBuilder,
    styleBuilder,
    referenceAnalyzer,
    assetPlanner,
    layoutPlanner,
    svgCoder,
    svgValidation,
    svgRender,
    svgOptimizer,
    evaluator,
    revisionPlanner,
    storageService,
    debugOverlay,
    svgGenerationWorkflow
  );

  const packOrchestrator = new SvgPackBuildOrchestrator(
    packPlanner,
    classifier,
    styleBuilder,
    orchestrator,
    consistencyEvaluator,
    zipExport,
    storageService,
    svgOptimizer,
    prisma
  );

  // Initialize controllers
  const svgAssetsController = new SvgAssetsController(
    orchestrator,
    svgRender,
    svgOptimizer,
    jobService
  );

  const svgPacksController = new SvgPacksController(packOrchestrator, jobService);

  // Register routes
  await app.register(async (instance) => {
    await svgAssetsRoutes(instance, svgAssetsController);
  }, { prefix: '' });

  await app.register(async (instance) => {
    await registerSvgPackRoutes(instance, svgPacksController);
  }, { prefix: '' });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const isDev = process.env.NODE_ENV === 'development';
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: isDev ? error.message : 'An unexpected error occurred',
    });
  });

  return app;
}
