const PATHS = {
  explore: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" />
    </>
  ),
  compare: (
    <>
      <path d="M4 19h16" />
      <path d="M5 15.5 9 12l3 2 3.5-6L19 5" />
      <path d="M5 9.5h3l3 1.5 4-1 4 .5" strokeDasharray="1.6 2.4" />
    </>
  ),
  year: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  outlook: (
    <>
      <path d="M3.5 18.5h17" />
      <path d="M4.5 15c2-4 4-6 7.5-6" />
      <path d="M12 9c3.5 0 5.5 2 7.5 6" strokeDasharray="1.8 2.4" />
      <path d="M12 5.5v1.5" />
    </>
  ),
  ask: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />
      <path d="M8 10h8M8 13h5" />
    </>
  ),
  method: (
    <>
      <path d="M6 3.5h8.5L18.5 7.5v13H6z" />
      <path d="M14 3.5v4.5h4.5M9 12h6.5M9 15.5h6.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  prev: <path d="m14.5 6-6 6 6 6" />,
  next: <path d="m9.5 6 6 6-6 6" />,
  layers: (
    <>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16 8.5 4.5 8.5-4.5" />
    </>
  ),
  tour: (
    <>
      <path d="M5 20.5V4" />
      <path d="M5 4.5h11l-2.5 3.5L16 11.5H5" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  expand: <path d="m7 14 5-5 5 5" />,
  fit: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </>
  ),
  flame: (
    <path d="M12 3c.7 3.4-1.3 5-2.8 6.8C7.8 11.5 7 13 7 15a5 5 0 0 0 10 0c0-2.3-1.1-3.8-2.2-5.1-.2 1.3-.9 2.2-1.9 2.6.6-3.2-.2-6.6-.9-9.5Z" />
  ),
};

export default function Icon({ name, size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
