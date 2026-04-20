import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const isRenderRuntime = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const serverEntry = path.resolve('server/index.js');
const nodeArgs = [];
const env = { ...process.env };

if (isRenderRuntime) {
  env.NODE_ENV = env.NODE_ENV || 'production';
} else {
  nodeArgs.push('--watch-path=server');

  if (existsSync(path.resolve('.env'))) {
    nodeArgs.push('--watch-path=.env');
  }
}

nodeArgs.push(serverEntry);

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env,
});

child.on('error', (error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
