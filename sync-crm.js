#!/usr/bin/env node
// One-command sync of dnative-hash/brela-desk-crm with Swai-D/brela-desk.
//
//   node sync-crm.js            # fetch → merge → feature checks → tests (package + frontend) → push → mirror branches
//   node sync-crm.js --full     # also run every test suite (fresh DB for each), like tests/run.sh
//   node sync-crm.js --no-push  # do everything except pushing (inspect the result yourself)
//   node sync-crm.js --dry-run  # only fetch + report differences, change nothing
//
// Safety notes:
//   - Tests NEVER touch the real database: they run with DATABASE_URL forced to the
//     throwaway `brela_test` database, on PORT=3100 (the dev server uses 3000).
//   - Nothing is committed to the working branch. Merges happen on a throwaway branch
//     created from crm/main, which is pushed to crm/main and then deleted.
'use strict';
const {spawn, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const FULL = process.argv.includes('--full');
const NO_PUSH = process.argv.includes('--no-push');
const DRY = process.argv.includes('--dry-run');
const TMP = 'sync-crm-auto';
const PORT = 3100;
const TEST_DB = 'postgres://postgres:davyswai1995@localhost:5432/brela_test';

let step = 0;
const log = m => console.log(`\n[${++step}] ${m}`);
const info = m => console.log(`    ${m}`);
const die = m => { console.error(`\nSTOP: ${m}`); process.exitCode = 1; cleanup(); process.exit(process.exitCode); };

// ---- git helpers ------------------------------------------------------------
const git = (args, opts = {}) => {
  if (typeof args === 'string') args = args.split(/\s+/);
  const r = spawnSync('git', args, {cwd: ROOT, encoding: 'utf8', ...opts});
  if (r.status !== 0 && !opts.allowFail)
    die(`git ${args.join(' ')} failed:\n${(r.stderr || r.stdout || '').trim()}`);
  return (r.stdout || '').replace(/\r\n/g, '\n').trim();
};
const gitAllowFail = args => git(args, {allowFail: true});

// ---- spawned server processes ----------------------------------------------
const kids = [];
const killTree = pid => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {stdio: 'ignore'});
  else try { process.kill(pid); } catch {}
};
function cleanup() {
  while (kids.length) { const k = kids.pop(); try { killTree(k.pid); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function runSuite(name, env, logFile) {
  info(`suite ${name}: reset DB, start mocks + server…`);
  const reset = spawnSync('node', ['tests/reset.js'], {cwd: ROOT, env, encoding: 'utf8'});
  if (reset.status !== 0) die(`tests/reset.js failed:\n${(reset.stderr || reset.stdout || '').trim()}`);
  const mocks = ['tests/mock-graph.js', 'tests/mock-ai.js'].map(f => {
    const p = spawn('node', [f], {cwd: ROOT, env, stdio: 'ignore'});
    kids.push(p); return p;
  });
  const srvLog = fs.openSync(logFile, 'w');
  const srv = spawn('node', ['server.js'], {cwd: ROOT, env, stdio: ['ignore', srvLog, srvLog]});
  kids.push(srv);
  // wait for the server to answer on PORT
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise(r => setTimeout(r, 500));
    up = await fetch(`http://127.0.0.1:${PORT}/login.html`).then(r => r.ok).catch(() => false);
  }
  if (!up) {
    killTree(srv.pid); mocks.forEach(killTree);
    die(`server did not start on port ${PORT} — see ${logFile}`);
  }
  const t = spawnSync('node', [`tests/${name}.test.js`], {cwd: ROOT, env, encoding: 'utf8'});
  cleanup();
  fs.closeSync(srvLog);
  const out = (t.stdout || '') + (t.stderr || '');
  const failLines = out.split('\n').filter(l => /^\s*FAIL/.test(l)).join('\n');
  if (failLines) console.log(failLines);
  if (t.status !== 0) {
    const tail = fs.readFileSync(logFile, 'utf8').split('\n').slice(-40).join('\n');
    die(`suite ${name} failed (exit ${t.status})\n---- server log tail ----\n${tail}`);
  }
  info(`suite ${name}: OK`);
}

// ---- test environment (never the real DB) -----------------------------------
function testEnv() {
  const env = {...process.env};
  Object.assign(env, {
    DATABASE_URL: TEST_DB,
    ADMIN_EMAIL: 'boss@test.co', ADMIN_PASSWORD: 'Secret123!', ADMIN_NAME: 'Neema',
    JWT_SECRET: 'ci-secret', NODE_ENV: 'test', PORT: String(PORT),
    ENCRYPTION_KEY: '0'.repeat(64),
    AI_BASE_ANTHROPIC: 'http://localhost:4020/anthropic', AI_BASE_OPENAI: 'http://localhost:4020/openai',
    AI_BASE_GOOGLE: 'http://localhost:4020/google', AI_BASE_XAI: 'http://localhost:4020/xai',
    AI_BASE_MISTRAL: 'http://localhost:4020/mistral',
    WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: 'PN1', WHATSAPP_VERIFY_TOKEN: 'vt',
    WHATSAPP_APP_SECRET: 'sec', WA_GRAPH_BASE: 'http://localhost:4010', WA_AUTOREPLY: 'true',
  });
  return env;
}

const suites = FULL
  ? ['api', 'whatsapp', 'report', 'playbook', 'crud', 'roles', 'deploy', 'pagination', 'track', 'frontend', 'history', 'lists', 'engine', 'ai', 'templates', 'package']
  : ['frontend', 'package']; // frontend is static (no server); package needs the server

(async () => {
  // 0. preflight ---------------------------------------------------------------
  log('Preflight');
  const remotes = git('remote').split('\n');
  for (const r of ['origin', 'crm']) if (!remotes.includes(r)) die(`missing git remote "${r}"`);
  const here = git('branch --show-current') || 'detached';
  info(`working branch: ${here}`);
  const dirty = git('status --porcelain').split('\n').filter(Boolean)
    .filter(l => !l.startsWith('??') || !/layouts/.test(l));
  if (dirty.length) die(`working tree has uncommitted changes — commit or stash first:\n${dirty.join('\n')}`);
  info('working tree clean (layouts/ ignored)');

  // 1. fetch -------------------------------------------------------------------
  log('Fetch origin + crm');
  git('fetch origin --prune'); git('fetch crm --prune');
  const originMain = git('rev-parse origin/main'), crmMain = git('rev-parse crm/main');
  info(`origin/main = ${originMain.slice(0, 7)}`);
  info(`crm/main    = ${crmMain.slice(0, 7)}`);

  const diff = () => gitAllowFail(['diff', 'crm/main', 'origin/main', '--stat']);
  let treeDiff = diff();

  // 2. merge (only when trees differ) ------------------------------------------
  if (treeDiff) {
    if (DRY) {
      console.log('\n-- differences crm/main ← origin/main --');
      console.log(treeDiff);
      log('Dry run: stopping before merge/tests/push (--dry-run)');
      return finish(originMain, crmMain, true);
    }
    log(`Merge origin/main into a temp branch from crm/main (${TMP})`);
    git(`checkout -b ${TMP} crm/main`);
    const merge = gitAllowFail(['merge', 'origin/main', '--no-edit']);
    if (merge === '' && gitAllowFail(['status', '--porcelain']).split('\n').some(l => /^(UU|AA|DD)/.test(l))) {
      git('merge --abort'); git(`checkout ${here}`);
      die('merge has conflicts — resolve them manually (this needs a human), then re-run');
    }
    info('merge clean');
  } else {
    log('crm/main already matches origin/main (no merge needed)');
    if (DRY) return finish(originMain, crmMain, true);
  }

  // 3. Word-package feature checks ----------------------------------------------
  log('Word package feature checks (brela.js)');
  const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/brela.js'), 'utf8');
  const checks = {'import button': 'tpack', 'word badge': 'has_docx', 'docx flow': 'docxGen', 'generate-docx api': 'generate-docx'};
  let bad = 0;
  for (const [n, k] of Object.entries(checks)) {
    const okk = src.includes(k);
    console.log(`    ${okk ? 'PASS' : 'FAIL'} ${n}`);
    if (!okk) bad++;
  }
  const syntax = spawnSync('node', ['--check', 'public/assets/js/brela.js'], {cwd: ROOT, encoding: 'utf8'});
  if (bad || syntax.status !== 0) {
    gitAllowFail(['checkout', here]); git(`branch -D ${TMP}`); gitAllowFail(['merge', '--abort']);
    die('Word package features broke in the merged code — not pushing');
  }

  // 4. tests --------------------------------------------------------------------
  log(`Tests on brela_test (PORT=${PORT}, real DB untouched)${FULL ? ' — FULL' : ''}`);
  const env = testEnv();
  for (const s of suites) await runSuite(s, env, path.join(os.tmpdir(), `sync-crm-server-${s}.log`));

  // 5. push ---------------------------------------------------------------------
  if (NO_PUSH) {
    log('--no-push: leaving merge on local branch ' + TMP);
    git(`checkout ${here}`);
    info(`inspect with: git checkout ${TMP}; git diff crm/main`);
    return finish(originMain, crmMain, false);
  }
  log('Push temp branch → crm/main');
  const push = spawnSync('git', ['push', 'crm', `${TMP}:main`], {cwd: ROOT, encoding: 'utf8'});
  if (push.status !== 0) {
    const err = (push.stderr || '').trim();
    if (/fetch first|non-fast-forward/i.test(err)) {
      info('crm/main moved meanwhile — refetching and re-merging');
      git('fetch crm --prune');
      git(`checkout ${TMP}`);
      git('merge crm/main --no-edit'); git('merge origin/main --no-edit');
      git(`push crm ${TMP}:main`);
    } else {
      git(`checkout ${here}`);
      die(`push rejected:\n${err}`);
    }
  }

  // 6. cleanup + final verify -----------------------------------------------------
  log('Cleanup temp branch, back to ' + here);
  git(`checkout ${here}`);
  git(`branch -D ${TMP}`);
  git('fetch crm --prune');
  const finalDiff = diff();
  if (finalDiff) die(`crm/main still differs from origin/main after push:\n${finalDiff}`);
  info(`crm/main = ${git('rev-parse crm/main').slice(0, 7)} — content identical to origin/main ✓`);

  // 7. mirror feature branches ------------------------------------------------------
  log('Mirror unmerged feature branches to crm');
  const originBranches = git('for-each-ref refs/remotes/origin --format=%(refname:short)')
    .split('\n').filter(b => b && b !== 'origin/HEAD' && b !== 'origin').map(b => b.replace(/^origin\//, ''));
  const crmBranches = new Set(git('for-each-ref refs/remotes/crm --format=%(refname:short)')
    .split('\n').filter(b => b && b !== 'crm/HEAD' && b !== 'crm').map(b => b.replace(/^crm\//, '')));
  let mirrored = 0;
  for (const b of originBranches) {
    if (crmBranches.has(b) || b === 'main') continue;
    info(`mirroring ${b}`);
    const p = spawnSync('git', ['push', 'crm', `refs/remotes/origin/${b}:refs/heads/${b}`], {cwd: ROOT, encoding: 'utf8'});
    if (p.status !== 0) console.log(`    WARN could not push ${b}: ${(p.stderr || '').trim().split('\n').pop()}`);
    else mirrored++;
  }
  if (!mirrored) info('nothing to mirror — all branches already exist on crm');

  return finish(originMain, crmMain, true, mirrored);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });

function finish(originMain, crmMain, ok, mirrored = 0) {
  console.log(`
=============================================
${ok ? 'DONE ✓' : 'STOPPED ✗'}
  origin/main: ${originMain.slice(0, 7)}
  crm/main:    ${gitAllowFail(['rev-parse', 'crm/main']).slice(0, 7)}
  suites run:  ${suites.join(', ')}
  mirrored:    ${mirrored || '0 new'}
=============================================`);
  process.exitCode = ok ? 0 : 1;
}
