import { ListRow } from '@toss/tds-mobile';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import type { Fact } from './detail-facts';

/** Label/value rows in the TDS ListRow form. Unknown values stay muted rather than looking confirmed. */
export default function DetailFacts({ facts }: { facts: Fact[] }) {
  return <TDSMobileAITProvider brandPrimaryColor="#087f70"><div className="detail-facts-list">{facts.map(fact => <ListRow key={fact.label} as="div" border="none" horizontalPadding="small" verticalPadding="medium"
    contents={<ListRow.Texts type="1RowTypeA" top={fact.label} />}
    right={<ListRow.Texts type="Right1RowTypeA" top={<span className={fact.known ? 'fact-known' : 'fact-unknown'}>{fact.value}</span>} />} />)}</div></TDSMobileAITProvider>;
}
