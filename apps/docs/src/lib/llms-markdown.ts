import type { LLMsOptions } from 'fumadocs-core/mdx-plugins/remark-llms';

/**
 * The subset of `Nodes` that `stringify`/`filterElement` actually receive for
 * a custom MDX component, derived from fumadocs-core's own signature rather
 * than importing `mdast`/`mdast-util-mdx` types directly, which are not
 * resolvable as bare specifiers from this package.
 */
type MdxElement = Extract<
  Parameters<NonNullable<LLMsOptions['stringify']>>[0],
  { type: 'mdxJsxFlowElement' | 'mdxJsxTextElement' }
>;
type StringifyState = Parameters<NonNullable<LLMsOptions['stringify']>>[2];
type StringifyInfo = Parameters<NonNullable<LLMsOptions['stringify']>>[3];

interface TypeTableEntry {
  name: string;
  description?: string;
  tags: Array<{ name: string; text: string }>;
  type: string;
  simplifiedType: string;
  required: boolean;
  deprecated: boolean;
}

interface TypeTableDoc {
  id: string;
  name: string;
  description?: string;
  entries: TypeTableEntry[];
}

function attributeText(node: MdxElement, name: string): string | undefined {
  const attribute = node.attributes.find(
    (candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === name,
  );
  if (attribute?.type !== 'mdxJsxAttribute') return undefined;

  const { value } = attribute;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return undefined;
}

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function containerText(node: MdxElement, state: StringifyState, info: StringifyInfo): string {
  return node.type === 'mdxJsxFlowElement'
    ? state.containerFlow(node, info)
    : state.containerPhrasing(node, info);
}

/**
 * `remarkAutoTypeTable` (wired in `source.ts`) replaces every
 * `<AutoTypeTable>` call with a `<TypeTable type={...} />` whose `type` prop
 * is, thanks to `remarkStringify: true`, also available as a JSON string,
 * exactly so a text renderer like this one can turn it back into a table
 * instead of leaving the component call as JSX.
 */
function stringifyTypeTable(node: MdxElement): string | undefined {
  const raw = attributeText(node, 'type');
  if (!raw) return undefined;

  let doc: TypeTableDoc;
  try {
    doc = JSON.parse(raw) as TypeTableDoc;
  } catch {
    return undefined;
  }
  if (doc.entries.length === 0) return undefined;

  const rows = doc.entries.map((entry) => {
    const defaultTag = entry.tags.find((tag) => tag.name === 'default')?.text;
    const name = entry.deprecated ? `\`${entry.name}\` (deprecated)` : `\`${entry.name}\``;
    const type = `\`${cell(entry.simplifiedType || entry.type)}\``;
    const required = entry.required ? 'Yes' : 'No';
    const defaultValue = defaultTag ? `\`${cell(defaultTag)}\`` : '-';
    const description = cell(entry.description ?? '');
    return `| ${name} | ${type} | ${required} | ${defaultValue} | ${description} |`;
  });

  return [
    '| Property | Type | Required | Default | Description |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/** `<Card title="..." href="..." />` becomes one link in a markdown list. */
function stringifyCard(node: MdxElement): string | undefined {
  const title = attributeText(node, 'title');
  if (!title) return undefined;

  const href = attributeText(node, 'href');
  return href ? `- [${title}](${href})` : `- ${title}`;
}

function isNamed(node: MdxElement['children'][number], name: string): node is MdxElement {
  return (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === name
  );
}

/** `<Cards><Card .../>...</Cards>` becomes the list of `Card` links. */
function stringifyCards(node: MdxElement): string {
  return node.children
    .filter((child) => isNamed(child, 'Card'))
    .map((card) => stringifyCard(card as MdxElement))
    .filter((line): line is string => line !== undefined)
    .join('\n\n');
}

/**
 * `remarkCodeTab` (part of the default preset) turns fenced blocks tagged
 * `tab="pnpm"` into this component tree. `CodeBlockTabsList` only repeats
 * the label already on each fence as a tab button, so it is skipped rather
 * than rendered.
 */
function stringifyCodeBlockTabs(
  node: MdxElement,
  state: StringifyState,
  info: StringifyInfo,
): string {
  return node.children
    .filter((child) => isNamed(child, 'CodeBlockTab'))
    .map((tab) => stringifyCodeBlockTab(tab as MdxElement, state, info))
    .join('\n\n');
}

/** `<Callout type="warn">...</Callout>` becomes a labelled blockquote. */
function stringifyCallout(node: MdxElement, state: StringifyState, info: StringifyInfo): string {
  const type = attributeText(node, 'type');
  const label =
    type === 'warn' || type === 'warning' ? 'Warning' : type === 'error' ? 'Error' : 'Note';

  const [first, ...rest] = containerText(node, state, info).split('\n');
  return [`**${label}:** ${first ?? ''}`, ...rest]
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

/** `<CodeBlockTab value="pnpm">...</CodeBlockTab>` becomes a labelled fence. */
function stringifyCodeBlockTab(
  node: MdxElement,
  state: StringifyState,
  info: StringifyInfo,
): string {
  const value = attributeText(node, 'value');
  const body = containerText(node, state, info);
  return value ? `**${value}**\n\n${body}` : body;
}

/**
 * Renders the docs' handful of custom MDX components as plain markdown for
 * the text mirrors (`llms-full.txt`, `content.md`), instead of leaving the
 * component call as literal JSX, which fumadocs-core's default stringifier
 * does for any component it does not specifically recognise.
 *
 * `remarkLLMs` (which this feeds) hardcodes its own `filterElement` and
 * never consults one passed in here. `stringify` is the only hook it
 * actually delegates to, so every case below, including unwrapping a layout
 * wrapper like `Cards`, is handled through it.
 */
export const llmsMarkdownOptions: LLMsOptions = {
  stringify(node, _parent, state, info) {
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return undefined;

    switch (node.name) {
      case 'TypeTable':
        return stringifyTypeTable(node);
      case 'Card':
        return stringifyCard(node);
      case 'Cards':
        return stringifyCards(node);
      case 'Callout':
        return stringifyCallout(node, state, info);
      case 'CodeBlockTab':
        return stringifyCodeBlockTab(node, state, info);
      case 'CodeBlockTabs':
        return stringifyCodeBlockTabs(node, state, info);
      default:
        return undefined;
    }
  },
};
