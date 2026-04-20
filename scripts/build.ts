import { execSync } from 'child_process';
import { readFileSync, rmSync, statSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const spinner = ora('Building qbo-migrate...').start();

function getDirectorySize(dir: string): number {
  let size = 0;
  for (const file of readdirSync(dir)) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    size += stat.isDirectory() ? getDirectorySize(filePath) : stat.size;
  }
  return size;
}

try {
  spinner.text = 'Cleaning previous build output...';
  rmSync('dist', { recursive: true, force: true });

  spinner.text = 'Compiling with tsup (ESM + source maps + declarations)...';
  execSync('tsup', { stdio: 'pipe' });

  spinner.succeed(chalk.green('[ok] Build complete'));

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string };

  console.log(chalk.cyan('\nBuild summary:'));
  console.log(chalk.gray('  Output directory:   ') + chalk.white('./dist'));
  console.log(chalk.gray('  Format:             ') + chalk.white('ESM only'));
  console.log(chalk.gray('  Source maps:        ') + chalk.white('Yes'));
  console.log(chalk.gray('  Type declarations:  ') + chalk.white('Yes'));
  if (pkg.version) {
    console.log(chalk.gray('  Package version:    ') + chalk.white(pkg.version));
  }

  if (existsSync('dist')) {
    const sizeKB = (getDirectorySize('dist') / 1024).toFixed(2);
    console.log(chalk.gray('  Total size:         ') + chalk.white(`${sizeKB} KB`));
  }
} catch (error) {
  spinner.fail(chalk.red('[x] Build failed'));
  console.error(error);
  process.exit(1);
}
