import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './log.js';

export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    // Type guard for Node.js file system errors
    const isNodeError = (err: unknown): err is NodeJS.ErrnoException => {
      return err != null && typeof err === 'object' && 'code' in err;
    };

    if (isNodeError(error) && error.code !== 'ENOENT') {
      logger.debug(`Failed to read file ${filePath}: ${error.message}`);
    }
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createTempFile(): Promise<string> {
  const { tmpdir } = await import('os');
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'qbo-migrate-'));
  return path.join(tempDir, 'env.tmp');
}

export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to delete temp file ${filePath}: ${errorMessage}`);
  }
}

export async function backupFile(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup.${timestamp}`;

  try {
    const content = await readFile(filePath);
    if (content) {
      await writeFile(backupPath, content);
      return backupPath;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to backup ${filePath}: ${errorMessage}`);
  }

  return null;
}
