interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export type IconName =
  | "spark"
  | "plus"
  | "send"
  | "stop"
  | "settings"
  | "folder"
  | "cloud"
  | "trash"
  | "chevron"
  | "terminal"
  | "file"
  | "edit"
  | "search"
  | "globe"
  | "wrench"
  | "brain"
  | "branch"
  | "check"
  | "x"
  | "link"
  | "alert";

const PATHS: Record<IconName, React.ReactNode> = {
  spark: (
    <path d="M12 2l2.1 5.9a2 2 0 001.2 1.2L21 11l-5.7 1.9a2 2 0 00-1.2 1.2L12 20l-2.1-5.9a2 2 0 00-1.2-1.2L3 11l5.7-1.9a2 2 0 001.2-1.2L12 2z" />
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  send: (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  folder: <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />,
  cloud: <path d="M17.5 19a4.5 4.5 0 100-9h-1.1A7 7 0 103.7 13.8 4 4 0 006.5 19h11z" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </>
  ),
  chevron: <path d="M9 18l6-6-6-6" />,
  terminal: (
    <>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  edit: (
    <>
      <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a4.5 4.5 0 00-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 006-6l-3.2 3.2-2.8-2.8z" />
  ),
  brain: (
    <>
      <path d="M9.5 2A2.5 2.5 0 007 4.5v15a2.5 2.5 0 005 0v-15A2.5 2.5 0 009.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0117 4.5v15a2.5 2.5 0 01-5 0" />
      <path d="M7 8H5a2 2 0 00-2 2v1a2 2 0 002 2h2M17 8h2a2 2 0 012 2v1a2 2 0 01-2 2h-2" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="9" r="3" />
      <path d="M6 9v6" />
      <path d="M18 12a9 9 0 01-9 6" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </>
  ),
};

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
