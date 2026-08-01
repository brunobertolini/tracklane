import { loader } from 'fumadocs-core/source';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { defineDocs } from 'fumadocs-mdx/macro';
import type { GenerateOptions } from 'fumadocs-typescript';
import { createGenerator, remarkAutoTypeTable } from 'fumadocs-typescript';
import { llmsMarkdownOptions } from './llms-markdown';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';

const typeTableGenerator = createGenerator();

type TypeSimplifierContext = Parameters<
  NonNullable<NonNullable<GenerateOptions['typeSimplifier']>['shouldSimplify']>
>[0];

/**
 * fumadocs-typescript's default simplifier collapses *any* union to the bare
 * word "union", including a union of string literals, where the members
 * are the entire point (e.g. `ConsentState`'s `'granted' | 'denied'`). Keep
 * the real type for a union of literals (and, for an optional field, the
 * `undefined` alongside them); keep simplifying everything else (arrays,
 * tuples, structural object shapes) exactly as before.
 */
function preferLiteralUnions(ctx: TypeSimplifierContext): boolean {
  const members = ctx.type.isUnion() ? ctx.type.getUnionTypes() : [ctx.type];
  const isLiteralish = members.every(
    (member) =>
      member.isLiteral() || member.isBooleanLiteral() || member.isUndefined() || member.isNull(),
  );
  return !isLiteralish;
}

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    // Expands `<AutoTypeTable path="..." name="..." />` into a `<TypeTable>`
    // at build time, straight from the library's TSDoc. No runtime ts-morph
    // pass, and (paired with `remarkStringify: true`) a JSON copy of the
    // table that `llms-markdown.ts` turns into a real markdown table for the
    // text mirrors. Runs before the rest of the preset so the expanded
    // content, not the bare component call, feeds the search index.
    mdxOptions: applyMdxPreset({
      remarkPlugins: (defaults) => [
        [
          remarkAutoTypeTable,
          {
            name: 'AutoTypeTable',
            generator: typeTableGenerator,
            remarkStringify: true,
            // Matches how `path="../../packages/tracklane/..."` already
            // resolved when `AutoTypeTable` ran as a request-time React
            // component with no configured `basePath`: relative to this
            // app's own root, not the MDX file's directory.
            options: {
              basePath: process.cwd(),
              typeSimplifier: { shouldSimplify: preferLiteralUnions },
            },
          },
        ],
        ...defaults,
      ],
    }),
    postprocess: {
      includeProcessedMarkdown: llmsMarkdownOptions,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [],
});

export function getPageImageUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/${[page.locale, ...docsImageRoute.split('/'), ...segments].filter(Boolean).join('/')}`,
  };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md'];

  return {
    segments,
    url: `/${[page.locale, ...docsContentRoute.split('/'), ...segments].filter(Boolean).join('/')}`,
  };
}

/**
 * `mdast-util-to-markdown` falls back to numeric character references (e.g.
 * `&#x2A;`) instead of a backslash escape whenever a literal `\` would not
 * be safe to parse back (for instance, right after inline code). That is
 * correct for markdown meant to be re-parsed, but these files are read as
 * plain text, where an un-decoded entity is just noise. Decode it back.
 */
function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${decodeNumericEntities(processed)}`;
}
