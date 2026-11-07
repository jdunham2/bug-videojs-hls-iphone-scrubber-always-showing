import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Build label shown in game (title screen and a corner tag), so a refresh shows
// whether you're on a new build: commit count, short hash, build time (UTC).
function buildLabel() {
  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const count = git('rev-list --count HEAD');
  const hash = git('rev-parse --short HEAD');
  const dirty = git('status --porcelain --untracked-files=no') ? '+' : '';
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return [count && `Build ${count}`, hash && hash + dirty, `${when} UTC`].filter(Boolean).join(' · ');
}

// Relative asset paths so the build works under any subpath,
// e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(buildLabel()),
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
