#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { refreshSnapshot } = require('../lib/state-snapshots');
const { fetchJson } = require('../lib/camera-adapters');

// Run only in the reviewed scheduled workflow. No HTTP endpoint invokes this.
// Git credentials are supplied by the workflow's ordinary checkout integration.
// No token is accepted in CLI arguments, URLs or files by this script.
async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'scottew/monitor-the-situation') throw new Error('Unsupported refresh environment.');
  const code = process.argv[2];
  if (!['AZ', 'GA', 'WI'].includes(code)) throw new Error('Unsupported state.');
  const root = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mts-directory-'));
  const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = 'refs/heads/camera-data';
  let worktreeAdded = false;
  try {
    // Branch must be explicitly initialized during approved setup. Missing state
    // fails closed; do not invent an empty ledger after a transport error.
    git(['fetch', '--no-tags', 'origin', branch]);
    const version = git(['rev-parse', 'FETCH_HEAD']);
    git(['worktree', 'add', '--detach', dir, version]); worktreeAdded = true;
    const write = async (filename, data) => {
      const temporary = path.join(dir, `.mts-${filename}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(data) + '\n', { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, path.join(dir, filename));
    };
    const commitAndPush = message => {
      git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', message], dir);
      // Non-forced push is the compare-and-swap: reject if another writer has
      // advanced the branch. A rejected reservation must precede all API calls.
      git(['push', 'origin', `HEAD:${branch}`], dir);
      return git(['rev-parse', 'HEAD'], dir);
    };
    const store = {
      async read() {
        const file = path.join(dir, 'ledger.json');
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.size > 8192) throw new Error('Invalid ledger file.');
        return { version, ledger: JSON.parse(await fs.readFile(file, 'utf8')) };
      },
      async reserve(expected, ledger) {
        if (git(['rev-parse', 'HEAD'], dir) !== expected) throw new Error('Concurrent refresh.');
        await write('ledger.json', ledger); git(['add', '--', 'ledger.json'], dir);
        return commitAndPush(`Reserve ${code} directory refresh`);
      },
      async publish(expected, state, snapshot) {
        if (state !== code || git(['rev-parse', 'HEAD'], dir) !== expected) throw new Error('Concurrent refresh.');
        await write(`${state}.json`, snapshot); git(['add', '--', `${state}.json`], dir);
        commitAndPush(`Update ${state} camera directory`);
      },
    };
    const result = await refreshSnapshot({ code, store, fetchJson, env: process.env });
    console.log(`${result.state}: published ${result.count} camera views.`);
  } finally {
    if (worktreeAdded) {
      try { git(['worktree', 'remove', '--force', dir]); } catch (_) { /* Cleanup only. */ }
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
}
if (require.main === module) main().catch(() => {
  // Do not print transport errors or stack traces containing sensitive URLs.
  console.error('Directory refresh failed; no unvalidated snapshot was published.');
  process.exitCode = 1;
});
module.exports = { main };
