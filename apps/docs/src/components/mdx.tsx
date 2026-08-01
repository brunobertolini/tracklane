import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // `remarkAutoTypeTable` (wired in `lib/source.ts`) expands every
    // `<AutoTypeTable path="..." name="..." />` into this component at build
    // time, straight from the library's TSDoc, so the table cannot drift
    // from the source, and there is no per-request codegen pass.
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
