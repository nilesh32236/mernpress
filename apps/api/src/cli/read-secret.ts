import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function readLine(prompt: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });

  try {
    return (await readline.question(prompt)).trim();
  } finally {
    readline.close();
  }
}

/**
 * Reads a secret from a TTY without echoing it. Falls back with a clear error
 * when stdin is not interactive; callers must not accept secrets from argv.
 */
export async function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY) {
    throw new Error(
      'A TTY is required for the password prompt; use MERNPRESS_ADMIN_PASSWORD only outside production',
    );
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise<string>((resolve, reject) => {
    let value = '';
    let escapeState: 0 | 1 | 2 = 0;

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    };

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (escapeState === 1) {
          escapeState = character === '[' || character === 'O' ? 2 : 0;
          continue;
        }
        if (escapeState === 2) {
          if (character >= '@' && character <= '~') {
            escapeState = 0;
          }
          continue;
        }

        if (character === '\u001b') {
          escapeState = 1;
          continue;
        }

        if (character === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        value += character;
      }
    };

    stdin.on('data', onData);
  });
}
