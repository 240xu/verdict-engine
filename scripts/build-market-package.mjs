#!/usr/bin/env node
/**
 * Assembles the single DSH-market package (dsh-themis) from the
 * internal workspace layers (requires Node >= 18.17 to build): core validators are inlined under src/core and
 * every cross-package import is rewritten to a relative path, so the published
 * artifact carries exactly one runtime dependency (@deepseek-ai/dsh-tools).
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'packages', 'dsh-themis');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'src'), { recursive: true });

cpSync(join(root, 'packages/dsh-tech-lead-core/src'), join(out, 'src/core'), { recursive: true });
cpSync(join(root, 'packages/dsh-tech-lead-plugin/src'), join(out, 'src'), { recursive: true });

const CORE_SPEC = "from '@240xu/dsh-tech-lead-core'";
let rewritten = 0;
for (const rel of readdirSync(join(out, 'src'), { recursive: true })) {
  if (!rel.endsWith('.js')) continue;
  const file = join(out, 'src', rel);
  let text = readFileSync(file, 'utf8');
  if (text.includes(CORE_SPEC)) {
    const relSpec = relative(dirname(file), join(out, 'src', 'core', 'index.js')).split('\\').join('/');
    const spec = relSpec.startsWith('.') ? relSpec : './' + relSpec;
    text = text.replaceAll(CORE_SPEC, `from '${spec}'`);
    rewritten += 1;
  }
  writeFileSync(file, text);
}

writeFileSync(join(out, 'cordis.patch.yml'), readFileSync(join(root, 'packages/dsh-tech-lead-bundle/cordis.patch.yml'), 'utf8')
  .replace("name: '@240xu/dsh-tech-lead-plugin'", "name: 'dsh-themis'"));

// Post-rewrite guard: any surviving scoped specifier means a future format
// drift would ship an unloadable artifact while printing success.
for (const rel of readdirSync(join(out, 'src'), { recursive: true })) {
  if (!rel.endsWith('.js')) continue;
  const text = readFileSync(join(out, 'src', rel), 'utf8');
  if (/['"]@240xu\//.test(text)) {
    console.error(`build aborted: unrewritten specifier in ${rel}`);
    process.exit(1);
  }
}
const ymlText = readFileSync(join(out, 'cordis.patch.yml'), 'utf8');
if (!ymlText.includes("name: 'dsh-themis'")) {
  console.error('build aborted: cordis.patch.yml name replacement did not apply');
  process.exit(1);
}

writeFileSync(join(out, 'README.md'), [
  '# dsh-themis',
  '',
  'Themis — tech-lead lifecycle governance for DeepSeek Harness: **21 governance tools + discovery**',
  '(task tiering, state/plan/evidence validation, gate precheck/aggregation/reopen,',
  'release/install audits, context & progress analysis, critical path,',
  'resume reconciliation, mutation preview that always denies execution).',
  '',
  '`dsh plugin --profile headless add dsh-themis`',
  '',
  'No filesystem writes, no subprocesses, no network access — every tool computes',
  'over caller-supplied JSON only. Inputs are budget-bounded (oversized or',
  'unscannable payloads fail closed with INPUT_TOO_LARGE / SCAN_INCOMPLETE), and',
  'decision tools attach deterministic guidance (nextActions with doneWhen).',
  'Every tool accepts `protocolJson` to negotiate the result wire format',
  '(bare legacy / tech-lead.result.v1 envelope / tech-lead.result.v2 default), and',
  'canonical context snapshots (tech-lead.context v2) validate strictly or migrate',
  'unknown keys into namespaced extensions under compat mode.',
  'Upstream docs: https://github.com/240xu/verdict-engine',
  '',
].join('\n'));

const pkg = {
  name: 'dsh-themis',
  version: '1.4.0',
  description: 'Themis — tech-lead lifecycle governance for DeepSeek Harness: 22 governance tools plus capability discovery (classify/state/plan/evidence/gates/release/install audits, context/evidence/progress analysis, mutation preview). No writes, no subprocesses, no network.',
  license: 'MIT',
  type: 'module',
  main: 'src/index.js',
  exports: { '.': './src/index.js' },
  files: ['src/', 'cordis.patch.yml', 'README.md'],
  keywords: ['dsh', 'deepseek-harness', 'cordis', 'tech-lead', 'plugin', 'governance', 'themis'],
  publishConfig: { access: 'public' },
  repository: { type: 'git', url: 'git+https://github.com/240xu/verdict-engine.git', directory: 'packages/dsh-themis' },
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  dependencies: { '@deepseek-ai/dsh-tools': '0.1.0-rc.7' },
  engines: { node: '>=16' },
};
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`assembled packages/dsh-themis (${rewritten} files rewritten for inlined core)`);
