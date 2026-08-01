import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { Footer } from '@/components/footer';
import { baseOptions } from '@/lib/layout.shared';

/**
 * The home page is dark whatever the reader's theme is, and the docs are not.
 *
 * `dark` is Fumadocs' own class and it works from here because everything it
 * sets is a custom property, which inherits. The wrapper carries no transform
 * or overflow of its own, so the navigation inside it stays sticky.
 */
export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <div className="tl-home dark flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      {/* No theme switch here: it would be a control that changes nothing on
          the one page that ignores it. It stays in the docs, where it works. */}
      <HomeLayout {...baseOptions()} themeSwitch={{ enabled: false }}>
        {children}
        <Footer />
      </HomeLayout>
    </div>
  );
}
