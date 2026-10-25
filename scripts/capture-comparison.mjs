import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('docs/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['tablet',768,1024]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3001/#competition');
  await page.locator('.comparison-table').waitFor();
  await page.getByRole('button',{name:'집계 새로고침'}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`docs/screenshots/${name}-comparison.png`,fullPage:true});
  await page.getByRole('button',{name:'가정 계산',exact:true}).click();
  await page.getByRole('spinbutton',{name:'최종 비례 경쟁률 가정',exact:true}).fill('100');
  await page.locator('.scenario-panel').screenshot({path:`docs/screenshots/${name}-scenario.png`});
  const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  console.log(JSON.stringify({viewport:name,errors,noOverflow}));
  if(errors.length||!noOverflow)throw new Error('Browser verification failed');
  await page.close();
}
await browser.close();
