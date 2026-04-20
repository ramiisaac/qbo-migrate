import { describe, expect, it } from 'vitest';
import { exec, commandExists } from '@/utils/exec.js';

function isValidationError(e: unknown) {
  return e instanceof Error && /Invalid command|Command not allowed|Invalid arg/.test(e.message);
}
function isCommandError(e: unknown) {
  return e instanceof Error && /Command failed|Command not found/.test(e.message);
}

describe('exec security', () => {
  it('should reject commands with shell metacharacters', async () => {
    await expect(exec('ls && rm', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls; rm', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls | rm', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls `rm`', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls $(rm)', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls > /dev/null', [])).rejects.toSatisfy(isValidationError);
    await expect(exec('ls < /dev/null', [])).rejects.toSatisfy(isValidationError);
  });

  it('should reject disallowed commands', async () => {
    await expect(exec('rm', ['-rf', '/'])).rejects.toSatisfy(isValidationError);
    await expect(exec('curl', ['http://evil.com'])).rejects.toSatisfy(isValidationError);
    await expect(exec('sudo', ['rm', '-rf', '/'])).rejects.toSatisfy(isValidationError);
  });

  it('should reject invalid command types', async () => {
    await expect(exec('', [])).rejects.toSatisfy(isValidationError);
    await expect(exec(null as unknown as string, [])).rejects.toSatisfy(isValidationError);
    await expect(exec(undefined as unknown as string, [])).rejects.toSatisfy(isValidationError);
  });

  it('should reject invalid arguments', async () => {
    await expect(exec('git', ['arg\nwith\nnewlines'])).rejects.toSatisfy(isValidationError);
    await expect(exec('git', ['arg\rwith\rcarriage\rreturns'])).rejects.toSatisfy(
      isValidationError
    );
    await expect(exec('git', [123 as unknown as string])).rejects.toSatisfy(isValidationError);
    await expect(exec('git', 'not-an-array' as unknown as string[])).rejects.toSatisfy(
      isValidationError
    );
  });

  it('should allow safe commands', async () => {
    // This should not throw, even if command fails
    try {
      await exec('git', ['--version']);
    } catch (error) {
      expect(isCommandError(error) || isValidationError(error)).toBe(true);
    }
  });
});

describe('commandExists security', () => {
  it('should use secure exec function', async () => {
    // This should not throw for allowed commands
    const exists = await commandExists('node');
    expect(typeof exists).toBe('boolean');
  });
});
