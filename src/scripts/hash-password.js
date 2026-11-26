// Prints a scrypt hash for ADMIN_PASSWORD_HASH in .env.
//   npm run hash-password -- '<password>'
// or, to keep the password out of your shell history, run it without an argument and type it:
//   npm run hash-password

import { hashPassword } from '../lib/password.js';
import { createInterface } from 'node:readline';

async function readPassword() {
  const fromArg = process.argv[2];
  if (fromArg !== undefined) return fromArg;

  if (!process.stdin.isTTY) {
    // Piped input: read the first line.
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    return '';
  }

  // Interactive: prompt without echoing the characters.
  process.stdout.write('Password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let pwd = '';
    process.stdin.on('data', (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(pwd);
          return;
        }
        if (c === '\u0003') process.exit(130); // Ctrl+C
        if (c === '\u007f') pwd = pwd.slice(0, -1); // Backspace
        else pwd += c;
      }
    });
  });
}

const password = await readPassword();
if (password.length < 10) {
  console.error('Use a password of at least 10 characters.');
  process.exit(1);
}
const hash = await hashPassword(password);
console.log(hash);
console.error('\nPut this in .env (single quotes keep the $ signs intact):');
console.error(`ADMIN_PASSWORD_HASH='${hash}'`);
