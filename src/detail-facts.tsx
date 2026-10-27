// Kept free of TDS imports: the home bundle must not pull in the TDS runtime.
export interface Fact { label: string; value: string; known: boolean }
/** Same text before the TDS chunk loads, so the sheet never flashes empty values. */
export function FactsFallback({ facts }: { facts: Fact[] }) {
  return <dl className="detail-facts-fallback">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.known ? 'fact-known' : 'fact-unknown'}>{fact.value}</dd></div>)}</dl>;
}
