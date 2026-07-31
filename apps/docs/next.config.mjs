import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// GitHub Pages serves project sites under /<repo>. The deploy workflow sets
// NEXT_PUBLIC_BASE_PATH=/tracklane; local dev (and a custom domain) leaves it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default withMDX(config);
