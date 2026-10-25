import {readFile,readdir} from 'node:fs/promises';
import {unzipSync} from 'fflate';
const key=process.env.DART_API_KEY?.trim();
if(!key)throw new Error('DART_KEY_MISSING');
const secret=Buffer.from(key);let count=0;
async function check(path){
  const buffer=await readFile(path);count++;
  if(buffer.includes(secret))throw new Error('SECRET_IN_PUBLIC_ARTIFACT');
  if(path.endsWith('.ait')&&buffer[0]===0x50&&buffer[1]===0x4b){
    for(const entry of Object.values(unzipSync(buffer))){count++;if(Buffer.from(entry).includes(secret))throw new Error('SECRET_IN_PUBLIC_ARTIFACT');}
  }
}
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const next=`${path}/${entry.name}`;if(entry.isDirectory())await walk(next);else await check(next);}}
await walk('dist');await check('.cache/dart-schedule.json');await check('gongmodu.ait');
console.log(JSON.stringify({checkedFiles:count,keyFoundInPublicArtifacts:false}));
