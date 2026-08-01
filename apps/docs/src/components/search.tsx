'use client';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { staticClient } from 'fumadocs-core/search/client/orama-static';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { useEffect } from 'react';
import { tracking } from '@/components/analytics';
import { basePath } from '@/lib/shared';

export default function DefaultSearchDialog(props: SharedProps) {
  const { locale } = useI18n(); // (optional) for i18n
  const { search, setSearch, query } = useDocsSearch({
    client: staticClient({
      // The static index is a plain file fetched at runtime: Next does not
      // rewrite this URL, so the base path has to be applied by hand.
      from: `${basePath}/api/search`,
      locale,
    }),
  });

  // What people look for, and by omission what the documentation does not
  // answer. Reported once the typing settles, because every keystroke is a
  // query to the index and none of them is a search anybody performed.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 3) return;

    const settled = setTimeout(() => {
      tracking.track('search', { search_term: term });
    }, 800);

    return () => clearTimeout(settled);
  }, [search]);

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
