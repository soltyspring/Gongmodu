import type { CompanySummary } from '../../shared/schedule.ts';
import type { DetailSource } from './details.ts';

const compact=(s:string)=>s.replace(/\s/g,'');
/** Extract issuer sentences and labelled historical financials, never peer/forecast tables. */
export function summarizeCompany(source:DetailSource):CompanySummary {
  const {document,receiptNo}=source;
  const body=document.text;
  const issuer=[...body.matchAll(/(?:^|\n)\s*제\s*2\s*부\s*발행인에 관한 사항/g)].at(-1)?.index;
  const company=[...body.matchAll(/(?:^|\n)\s*[IⅠ]\.\s*회사의 개요\s*(?:\n|$)/g)].at(-1)?.index;
  const start=issuer??company;
  const result:CompanySummary={overview:null,revenueModel:null,financials:[],unit:null,scope:'공시 요약재무정보',receiptNo,sourceUrl:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`};
  if(start===undefined)return result;
  const finance=[...body.matchAll(/(?:^|\n)\s*(?:III|Ⅲ)\.\s*재무에 관한 사항\s*(?:\n|$)/g)].find(m=>m.index!>start)?.index;
  const business=body.slice(start,finance??undefined);
  const overviewStart=business.indexOf('주요 사업의 내용');
  const sentences=(s:string)=>(s.replace(/\s+/g,' ').match(/[^。!?]+?(?:습니다\.|합니다\.|입니다\.|있어요\.|다\.)/g)??[]).filter(s=>s.length>=20&&s.length<=1200);
  if(overviewStart>=0)result.overview=sentences(business.slice(overviewStart,overviewStart+2500)).find(s=>/당사|사업|기업/.test(s))?.replace(/^.*?당사는\s*/,'당사는 ').trim()??null;
  const businessStart=business.search(/(?:II|Ⅱ)\.\s*사업의 내용/);
  if(businessStart>=0){
    const model=business.slice(businessStart).split(/\n+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=40&&s.length<=1800&&/당사|동사|자사/.test(s)&&/매출은|매출로 구성|발생하는 매출|수익모델|수익 모델|당사의 사업은|제품은.*생산.*판매/.test(s)&&!/추정|예상|전망|비교회사/.test(s));
    const chosen=model.find(s=>/매출은|매출로 구성|발생하는 매출/.test(s))??model[0]??'';
    result.revenueModel=sentences(chosen).slice(0,2).map(s=>s.replace(/^주\d+\)\s*/,'').trim()).join(' ')||null;
    if(/당사의 제품은 고객사의 PO에 따라 제품을 생산 및 판매하는 사업/.test(chosen))result.revenueModel='고객사의 주문(PO)에 맞춰 제품을 생산하고 판매해요.';
    const prose=business.slice(businessStart).replace(/\s+/g,' ');
    if(/플랫폼 사업 매출은 중개수수료/.test(prose)&&/광고/.test(prose)&&/파트너십 사업은.{0,200}동사가 직접 매입/.test(prose)&&/브랜드 사업은 동사가.{0,100}자사브랜드 제품/.test(prose))result.revenueModel='플랫폼에서 중개수수료·광고 등으로 매출을 내요. 파트너사 제품을 직접 매입해 판매하고, 자체 브랜드 제품도 기획·판매해요.';
    if(result.revenueModel&&/^(?:등|및|[.,])/.test(result.revenueModel))result.revenueModel=null;
  }
  if(finance===undefined||!document.tableOffsets)return result;
  for(let i=0;i<document.tables.length;i++){
    const offset=document.tableOffsets[i];if(offset<finance||offset>finance+20000)continue;
    const table=document.tables[i];
    const header=table.find(row=>row.length>=3&&/^(구분|과목)$/.test(compact(row[0]))&&row.slice(1).every(c=>/20\d{2}/.test(c)));
    const revenue=table.find(row=>/^매출액$/.test(compact(row[0])));
    if(!header||!revenue||header.length!==revenue.length)continue;
    const context=body.slice(finance,offset);
    const unit=[...context.matchAll(/단위\s*[:：]\s*(백만원|천원|원)\s*\)/g)].at(-1)?.[1];
    if(!unit)continue;
    result.unit=unit;result.scope=/요약연결재무정보/.test(context)?'연결 요약재무정보':/요약별도|요약개별/.test(context)?'별도 요약재무정보':'공시 요약재무정보';
    const profit=table.find(row=>/^영업이익(?:\((?:영업)?손실\))?$|^영업손실$/.test(compact(row[0])));
    const accounting=table.find(row=>compact(row[0])==='회계처리기준');
    const numeric=(s:string)=>/^[-−]?[\d,]+(?:\.\d+)?$|^\([\d,]+(?:\.\d+)?\)$/.test(compact(s));
    result.financials=header.slice(1,5).flatMap((period,j)=>{
      if(!numeric(revenue[j+1])||/추정|예상|전망/.test(period))return [];
      const value=profit?.length===header.length&&numeric(profit[j+1])?profit[j+1].trim():null;
      const loss=value&&compact(profit![0])==='영업손실'&&!/^[-−(]|^0$/.test(value)?`(${value})`:value;
      return [{period:period.replace(/\s+/g,' ').trim(),revenue:revenue[j+1].trim(),operatingProfit:loss,accounting:accounting?.length===header.length?accounting[j+1].trim():null}];
    });
    break;
  }
  return result;
}
