/** A simple bike, drawn with lines, for the app's mark. */
export function BikeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5L9 9h6l3.5 7.5M9 9l3.5 7.5L15 9M8 6h3M15 9l-1-3h2.5" />
      <path d="M12.6 3.5l-1.2 2.4h2l-1.2 2.4" />
    </svg>
  );
}
