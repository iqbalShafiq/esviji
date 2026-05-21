import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadEnvFile(envFilePath: string): void {
  dotenv.config({ path: envFilePath });
}

export function loadRootEnv(): void {
  const rootEnvPath = path.resolve(__dirname, '../../../../.env');
  loadEnvFile(rootEnvPath);
}
