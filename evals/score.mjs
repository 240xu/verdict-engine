#!/usr/bin/env node
/**
 * CLI: score one or more eval transcripts against evals/evals.json checks.
 *
 * Usage:
 *   node evals/score.mjs --id 7 --transcript path/to/transcript.txt
 *   node evals/score.mjs --transcripts-dir path/to/dir   # files named <id>.txt
 *   node evals/score.mjs --transcripts-json path/to/map.json  # {"7": "text", ...}
 *
 * Exit code 0 iff every scored eval passes (skipped evals with no `checks`
 * always count as passing). Exit code 1 on any scoring failure or bad input.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAllEvals } from './score-core.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--id') out.id = argv[++i];
    else if (a === '--transcript') out.transcript = argv[++i];
    else if (a === '--transcripts-dir') out.transcriptsDir = argv[++i];
    else if (a === '--transcripts-json') out.transcriptsJson = argv[++i];
    else if (a === '--evals') out.evalsPath = argv[++i];
  }
  return out;
}

function loadTranscripts(args) {
  if (args.transcriptsJson) {
    return JSON.parse(readFileSync(args.transcriptsJson, 'utf8'));
  }
  if (args.transcriptsDir) {
    const dir = args.transcriptsDir;
    const bag = {};
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.txt')) continue;
      const id = basename(f, '.txt');
      bag[id] = readFileSync(join(dir, f), 'utf8');
    }
    return bag;
  }
  if (args.id && args.transcript) {
    return { [args.id]: readFileSync(args.transcript, 'utf8') };
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultEvalsPath = fileURLToPath(new URL('./evals.json', import.meta.url));
  const evalsPath = args.evalsPath ?? defaultEvalsPath;
  if (!existsSync(evalsPath)) {
    process.stderr.write(`evals file not found: ${evalsPath}\n`);
    process.exitCode = 1;
    return;
  }
  const evalsDoc = JSON.parse(readFileSync(evalsPath, 'utf8'));
  const transcripts = loadTranscripts(args);
  if (transcripts === null) {
    process.stderr.write('provide --id + --transcript, or --transcripts-dir, or --transcripts-json\n');
    process.exitCode = 1;
    return;
  }
  const report = scoreAllEvals(evalsDoc, transcripts);
  for (const r of report.results) {
    if (r.skipped) {
      process.stdout.write(`SKIP id=${r.id} (no machine checks; human review only)\n`);
      continue;
    }
    if (r.error) {
      process.stdout.write(`ERROR id=${r.id} ${r.error}\n`);
      continue;
    }
    process.stdout.write(`${r.passed ? 'PASS' : 'FAIL'} id=${r.id}\n`);
    for (const c of r.checks ?? []) {
      if (!c.ok) process.stdout.write(`  - ${c.error ? `[${c.error}] ` : ''}${c.label}\n`);
    }
  }
  const scoredResults = report.results.filter((r) => !r.skipped);
  const scoredPassed = scoredResults.filter((r) => r.passed).length;
  process.stdout.write(`\n${report.passedCount}/${report.total} passed (${scoredPassed}/${scoredResults.length} machine-scored, ${report.total - scoredResults.length} skipped human-review-only)\n`);
  process.exitCode = report.passedCount === report.total ? 0 : 1;
}

main();
