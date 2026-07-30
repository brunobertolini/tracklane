import { format } from '@brunobertolini/tln';
import Link from 'next/link';
import { appName, gitConfig } from '@/lib/shared';

// Runs the published API at build time: if the library breaks, the docs
// build breaks with it.
const tagline = format('  TODO: one-line pitch for the library.  ');

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{appName}</h1>
      <p className="max-w-xl text-fd-muted-foreground">{tagline}</p>
      <div className="flex flex-row gap-3">
        <Link
          href="/docs"
          className="rounded-full bg-fd-primary px-5 py-2 font-medium text-fd-primary-foreground"
        >
          Read the docs
        </Link>
        <a
          href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
          className="rounded-full border px-5 py-2 font-medium"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
