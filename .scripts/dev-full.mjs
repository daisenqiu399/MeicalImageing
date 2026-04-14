import { execa } from 'execa';

const children = [];
let shuttingDown = false;

function startProcess(command, args, label) {
  const child = execa(command, args, {
    stdio: 'inherit',
    preferLocal: true,
  });

  children.push(child);

  child.catch(error => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(`[dev-full] ${label} exited unexpectedly: ${error.shortMessage || error.message}`);
    shutdown(error.exitCode || 1);
  });

  child.then(() => {
    if (shuttingDown) {
      return;
    }

    console.error(`[dev-full] ${label} exited. Stopping remaining processes.`);
    shutdown(0);
  });

  return child;
}

async function shutdown(exitCode = 0) {
  if (shuttingDown && exitCode === 0) {
    return;
  }

  shuttingDown = true;

  await Promise.allSettled(
    children.map(async child => {
      try {
        child.kill('SIGTERM', {
          forceKillAfterTimeout: 5_000,
        });
        await child;
      } catch (_error) {
        return undefined;
      }
    })
  );

  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

startProcess('yarn', ['dev'], 'viewer');
startProcess('node', ['server/ai-proxy.js'], 'ai-proxy');
