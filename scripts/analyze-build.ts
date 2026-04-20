import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import chalk from 'chalk';

console.log(chalk.cyan('Analyzing build output...\n'));

function labelFor(file: string): string {
  const ext = extname(file);
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return '[js] ';
  if (file.endsWith('.d.ts')) return '[dts]';
  if (ext === '.map') return '[map]';
  if (ext === '.json') return '[json]';
  return '[file]';
}

function analyzeDirectory(dir: string, indent = ''): void {
  const entries = readdirSync(dir).sort();

  for (const file of entries) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      console.log(chalk.blue(`${indent}[dir] ${file}/`));
      analyzeDirectory(filePath, `${indent}  `);
    } else {
      const sizeKB = (stat.size / 1024).toFixed(2);
      console.log(chalk.gray(`${indent}${labelFor(file)} ${file} (${sizeKB} KB)`));
    }
  }
}

function getDirectorySize(dir: string): number {
  let size = 0;
  for (const file of readdirSync(dir)) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    size += stat.isDirectory() ? getDirectorySize(filePath) : stat.size;
  }
  return size;
}

if (!existsSync('dist')) {
  console.log(chalk.red('[x] No dist directory found. Run `pnpm build` first.'));
  process.exit(1);
}

analyzeDirectory('dist');

const totalSize = getDirectorySize('dist');
const totalKB = (totalSize / 1024).toFixed(2);

try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string };
  if (pkg.version) {
    console.log(chalk.cyan('\nPackage version: ') + chalk.white(pkg.version));
  }
} catch {
  // package.json missing or unreadable — non-fatal for a build analysis
}

console.log(chalk.cyan('Total build size: ') + chalk.white(`${totalKB} KB`));
