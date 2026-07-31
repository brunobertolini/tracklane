#!/usr/bin/env node
/**
 * Interactive project setup.
 *
 * Asks for the package name, GitHub coordinates and docs URL, then rewrites
 * every place they appear: package manifests, the docs site, workflows,
 * changesets config and the community files. It reads the CURRENT values from
 * the repository instead of hardcoding them, so it can be run again later to
 * rename the project.
 *
 * Usage:
 *   pnpm setup                       interactive
 *   pnpm setup -- --name @acme/x …   non-interactive (CI, agents)
 *
 * Flags: --name --description --owner --repo --author --domain
 *        --yes (accept current values for anything not passed)
 *        --dry-run --skip-install
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values: flags } = parseArgs({
  options: {
    name: { type: 'string' },
    description: { type: 'string' },
    owner: { type: 'string' },
    repo: { type: 'string' },
    author: { type: 'string' },
    domain: { type: 'string' },
    yes: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'skip-install': { type: 'boolean', default: false },
  },
  strict: true,
});

const DRY_RUN = flags['dry-run'];
const SKIP_INSTALL = flags['skip-install'] || DRY_RUN;
// Any flag given means the caller is scripting this: do not open a prompt.
const NON_INTERACTIVE =
  flags.yes ||
  ['name', 'description', 'owner', 'repo', 'author', 'domain'].some(
    (key) => flags[key] !== undefined,
  );

/** Directories never walked, and files whose contents must not be rewritten. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.source',
  '.turbo',
  'dist',
  'out',
  'coverage',
]);
const TEXT_EXTENSIONS = ['.json', '.ts', '.tsx', '.mjs', '.js', '.md', '.mdx', '.yml', '.yaml'];
// ADRs are a dated record of a decision — renaming the project does not
// rewrite history. A note is appended instead.
const FROZEN_PATHS = ['docs/decisions/', 'pnpm-lock.yaml', 'CHANGELOG.md'];

async function main() {
  const current = await readCurrentValues();
  const answers = await ask(current);
  const replacements = buildReplacements(current, answers);

  if (replacements.length === 0 && current.pkgDir === answers.pkgDir) {
    console.log('\nNothing to change — the repository already uses these values.');
    return;
  }

  console.log('\nReplacements:');
  for (const [from, to] of replacements) console.log(`  ${from}\n    -> ${to}`);

  const files = await collectFiles(ROOT);
  const changed = [];

  for (const file of files) {
    const original = await readFile(file, 'utf8');
    let next = original;
    for (const [from, to] of replacements) next = next.split(from).join(to);
    if (next === original) continue;
    changed.push(relative(ROOT, file));
    if (!DRY_RUN) await writeFile(file, next);
  }

  if (!DRY_RUN) {
    await applyDocsDeployment(answers);
    await applyOwnerFiles(current, answers);
    await renamePackageDir(current, answers);
    await noteRenameInAdr(current, answers);
  }

  console.log(`\n${changed.length} file(s) ${DRY_RUN ? 'would change' : 'changed'}:`);
  for (const file of changed) console.log(`  ${file}`);

  if (current.pkgDir !== answers.pkgDir) {
    console.log(`\nPackage directory: ${current.pkgDir} -> ${answers.pkgDir}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — nothing was written. Re-run without --dry-run to apply.');
    return;
  }

  if (!SKIP_INSTALL) {
    console.log('\nRunning pnpm install…');
    execFileSync('pnpm', ['install'], { cwd: ROOT, stdio: 'inherit' });
  }

  console.log('\nDone. Next:');
  console.log('  1. Review the diff: git diff');
  console.log('  2. Fill in the remaining TODOs (library API, docs pages, README pitch)');
  console.log('  3. pnpm check');
}

async function readCurrentValues() {
  const packagesDir = join(ROOT, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(packagesDir, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.private) continue;

    const docs = JSON.parse(await readFile(join(ROOT, 'apps/docs/package.json'), 'utf8'));
    const changesets = JSON.parse(await readFile(join(ROOT, '.changeset/config.json'), 'utf8'));
    const shared = await readFile(join(ROOT, 'apps/docs/src/lib/shared.ts'), 'utf8');

    const [owner = '', repo = ''] = String(changesets.changelog?.[1]?.repo ?? '').split('/');

    return {
      pkgName: manifest.name,
      pkgDir: `packages/${entry.name}`,
      docsName: docs.name,
      description: manifest.description ?? '',
      author: manifest.author ?? '',
      owner,
      repo,
      appName: matchConst(shared, 'appName'),
      siteUrl: matchConst(shared, 'siteUrl'),
    };
  }

  throw new Error('No publishable package found under packages/*');
}

function matchConst(source, name) {
  const match = source.match(new RegExp(`export const ${name} = '([^']*)'`));
  if (!match) throw new Error(`Could not read ${name} from apps/docs/src/lib/shared.ts`);
  return match[1];
}

async function ask(current) {
  const rl = NON_INTERACTIVE
    ? null
    : createInterface({ input: process.stdin, output: process.stdout });
  const prompt = async (flag, question, fallback) => {
    if (flags[flag] !== undefined) return flags[flag].trim();
    if (!rl) return fallback;
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback;
  };

  if (rl) console.log('Project setup — press Enter to keep the value in brackets.\n');

  const pkgName = await prompt(
    'name',
    'npm package name (e.g. @scope/name or name)',
    current.pkgName,
  );
  if (!/^(@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkgName)) {
    rl?.close();
    throw new Error(`"${pkgName}" is not a valid npm package name`);
  }

  const description = await prompt('description', 'One-line description', current.description);
  const owner = await prompt('owner', 'GitHub owner (user or org)', current.owner);
  const repo = await prompt('repo', 'GitHub repository name', current.repo);
  const author = await prompt('author', 'Author ("Name <email>")', current.author);
  const domain = await prompt(
    'domain',
    'Custom docs domain (leave empty to use GitHub Pages)',
    guessDomain(current),
  );

  rl?.close();

  const bare = pkgName.includes('/') ? pkgName.split('/')[1] : pkgName;
  const scope = pkgName.includes('/') ? `${pkgName.split('/')[0]}/` : '';

  return {
    pkgName,
    pkgDir: `packages/${bare}`,
    docsName: `${scope}${bare}-docs`,
    appName: bare,
    description,
    owner,
    repo,
    author,
    domain,
    siteUrl: domain ? `https://${domain}` : `https://${owner}.github.io/${repo}`,
  };
}

function guessDomain(current) {
  const pagesUrl = `https://${current.owner}.github.io/${current.repo}`;
  return current.siteUrl === pagesUrl ? '' : current.siteUrl.replace(/^https?:\/\//, '');
}

function buildReplacements(current, answers) {
  // Longest first: the site URL contains the owner, the package name contains
  // the bare name. Replacing in this order avoids partial rewrites.
  const pairs = [
    [current.siteUrl, answers.siteUrl],
    [`${current.owner}/${current.repo}`, `${answers.owner}/${answers.repo}`],
    [current.docsName, answers.docsName],
    [current.pkgName, answers.pkgName],
    [current.pkgDir, answers.pkgDir],
    [current.author, answers.author],
    // The contact e-mail also appears in CODE_OF_CONDUCT.md, outside the
    // "Name <email>" string.
    [emailOf(current.author), emailOf(answers.author)],
    [current.description, answers.description],
    [`appName = '${current.appName}'`, `appName = '${answers.appName}'`],
    [`repo: '${current.repo}'`, `repo: '${answers.repo}'`],
    [`user: '${current.owner}'`, `user: '${answers.owner}'`],
  ];

  return pairs.filter(([from, to]) => from && to && from !== to);
}

function emailOf(author) {
  return author.match(/<([^>]+)>/)?.[1] ?? '';
}

async function collectFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectFiles(full)));
      continue;
    }
    const rel = relative(ROOT, full);
    if (FROZEN_PATHS.some((frozen) => rel.startsWith(frozen) || rel.endsWith(frozen))) continue;
    if (!TEXT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    found.push(full);
  }
  return found;
}

/**
 * GitHub project pages live under /<repo>, which the docs build compensates for
 * with a base path. A custom domain serves from the root, so the base path has
 * to go away and a CNAME file has to ship with the static output.
 */
async function applyDocsDeployment(answers) {
  const workflowPath = join(ROOT, '.github/workflows/docs.yml');
  const workflow = await readFile(workflowPath, 'utf8');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not JS
  const basePathValue = answers.domain ? "''" : '/${{ github.event.repository.name }}';
  const next = workflow.replace(
    /( +NEXT_PUBLIC_BASE_PATH: ).*/,
    (_, indent) => `${indent}${basePathValue}`,
  );
  if (next !== workflow) await writeFile(workflowPath, next);

  const cnamePath = join(ROOT, 'apps/docs/public/CNAME');
  if (answers.domain) {
    await mkdir(dirname(cnamePath), { recursive: true });
    await writeFile(cnamePath, `${answers.domain}\n`);
    console.log(`\nWrote apps/docs/public/CNAME (${answers.domain}).`);
    console.log('Remember to point the DNS record at GitHub Pages.');
    return;
  }
  if (existsSync(cnamePath)) await rm(cnamePath);
}

/**
 * CODEOWNERS has no file extension and FUNDING.yml spells the owner without any
 * surrounding context, so neither is covered by the generic replacements.
 */
async function applyOwnerFiles(current, answers) {
  if (current.owner === answers.owner) return;

  for (const [path, from, to] of [
    ['.github/CODEOWNERS', `@${current.owner}`, `@${answers.owner}`],
    ['.github/FUNDING.yml', current.owner, answers.owner],
  ]) {
    const full = join(ROOT, path);
    if (!existsSync(full)) continue;
    const original = await readFile(full, 'utf8');
    const next = original.split(from).join(to);
    if (next !== original) await writeFile(full, next);
  }
}

async function renamePackageDir(current, answers) {
  if (current.pkgDir === answers.pkgDir) return;
  await rename(join(ROOT, current.pkgDir), join(ROOT, answers.pkgDir));
}

async function noteRenameInAdr(current, answers) {
  if (current.pkgName === answers.pkgName) return;
  const adrPath = join(ROOT, 'docs/decisions/0001-monorepo-stack.md');
  if (!existsSync(adrPath)) return;
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    adrPath,
    `${await readFile(adrPath, 'utf8')}\n> Nota (${today}): o pacote foi renomeado de \`${current.pkgName}\` para \`${answers.pkgName}\` via \`pnpm setup\`. O corpo do ADR preserva os nomes originais de propósito.\n`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
