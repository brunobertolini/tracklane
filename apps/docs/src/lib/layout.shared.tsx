import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

function TracklaneNavTitle() {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold">
      <svg
        aria-hidden="true"
        focusable="false"
        width="28"
        height="28"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-7"
      >
        <rect x="12" y="12" width="72" height="72" rx="18" fill="#09090B" />
        <path d="M22 48H38" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
        <path d="M38 48H50" stroke="#FF7043" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 48C60 48 63 30 73 30" stroke="#FF7043" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 48H74" stroke="#FF7043" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 48C60 48 63 66 73 66" stroke="#FF7043" strokeWidth="7" strokeLinecap="round" />
        <circle cx="23" cy="48" r="4" fill="#FFFFFF" />
        <circle cx="73" cy="30" r="5" fill="#FFFFFF" />
        <circle cx="74" cy="48" r="5" fill="#FFFFFF" />
        <circle cx="73" cy="66" r="5" fill="#FFFFFF" />
      </svg>
      <span>{appName}</span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <TracklaneNavTitle />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
