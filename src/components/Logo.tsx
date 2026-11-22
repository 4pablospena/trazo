export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="inline-flex items-center gap-2.5" aria-label="Trazo">
    <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path d="m12 27 4-12 4 9 8-12" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {!compact && <span className="brand-word">trazo<span className="text-violet-400">.</span></span>}
  </span>;
}
