import { ListRow } from '@toss/tds-mobile';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
export default function TossBrokerFact({broker}:{broker:string|null}) {
  return <TDSMobileAITProvider brandPrimaryColor="#087f70"><ListRow as="div" border="none" horizontalPadding="small" contents={<ListRow.Texts type="2RowTypeA" top="주관사" bottom={broker||'원본 확인 필요'} />} /></TDSMobileAITProvider>;
}
