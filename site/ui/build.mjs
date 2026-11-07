import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function buildUI(root = defaultRoot) {
  const output = path.join(root, 'public/static');
  await mkdir(output, { recursive: true });
  await cp(path.join(root,'site/ui/sound'),path.join(output,'sound'),{recursive:true});
  await cp(path.join(root, 'site/ui/material'), path.join(output, 'material'), { recursive: true });
  await cp(path.join(root, 'site/ui/embossed-theme.css'), path.join(output, 'embossed.css'));
  await cp(path.join(root, 'site/ui/mechanism.css'), path.join(output, 'mechanism.css'));
  await cp(path.join(root, 'site/ui/application.css'), path.join(output, 'application.css'));
  const cache = path.join(root, '.cache/ui');
  await mkdir(cache, { recursive: true });
  await build({ absWorkingDir: root, entryPoints: ['site/ui/render.tsx'], outfile: path.join(cache, 'render.mjs'),
    bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
  const runtime = await build({
    metafile: true, absWorkingDir: root, entryPoints: {lesson:'site/lesson.js',home:'site/home.js'}, outdir: output,
    bundle: true, format: 'esm', target: ['es2022'], minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'eof',
  });
  await build({absWorkingDir:root,entryPoints:['site/ui/page-flow.js'],outfile:path.join(output,'page-flow.js'),bundle:true,format:'iife',target:'es2022',minify:true,legalComments:'eof'});
  execFileSync(process.execPath, [path.join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
    '-i', 'site/ui/theme.css', '-o', 'public/static/ui.css', '--minify'], { cwd: root, stdio: 'inherit' });
  // Keep the editable component system's third-party notices with its runtime.
  const notices = [await readFile(path.join(root, 'site/ui/LICENSE.md'), 'utf8'),await readFile(path.join(root,'site/ui/sound/NOTICE.txt'),'utf8')];
  const bundledPackages = new Set(Object.keys(runtime.metafile.inputs).flatMap(filename => {
    const match = filename.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    return match ? [match[1]] : [];
  }));
  for (const name of [...bundledPackages, 'tailwindcss', 'tw-animate-css'].sort()) {
    const dir = path.join(root, 'node_modules', name);
    let license;
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'CopyrightNotice.txt', 'LICENSE-MIT.txt']) {
      try { license = await readFile(path.join(dir, file), 'utf8'); break; } catch {}
    }
    if (!license) {
      try { license = await readFile(path.join(root, 'site/ui/licenses', name.replaceAll('/', '__') + '.txt'), 'utf8'); } catch {}
    }
    if (license) notices.push(`${name}\n${license}`);
    else throw new Error('Missing bundled dependency license: ' + name);
  }
  await writeFile(path.join(output, 'ui-licenses.txt'), notices.join('\n\n---\n\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildUI();
