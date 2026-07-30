import { createGenerator } from 'fumadocs-typescript';
import { AutoTypeTable } from 'fumadocs-typescript/ui';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';

const generator = createGenerator();

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // Renders a type table straight from the library's TSDoc, so the API
    // reference cannot drift from the source.
    AutoTypeTable: (props: Omit<ComponentProps<typeof AutoTypeTable>, 'generator'>) => (
      <AutoTypeTable generator={generator} {...props} />
    ),
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
