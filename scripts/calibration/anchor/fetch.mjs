import fs from 'node:fs';
const B='https://api.sleeper.app/v1';
const urls={players:`${B}/players/nba`};
for(let y=2021;y<=2026;y++){urls['proj'+y]=`${B}/projections/nba/regular/${y}`;}
for(let y=2013;y<=2026;y++){urls['stats'+y]=`${B}/stats/nba/regular/${y}`;}
const entries=Object.entries(urls);
let i=0;
async function w(){for(;;){const e=entries[i++];if(!e)return;const [k,u]=e;const f=`${process.env.CALIB_DATA ?? '../data'}/${k}.json`;if(fs.existsSync(f))continue;const r=await fetch(u);if(!r.ok){console.log('FAIL',k,r.status);continue;}fs.writeFileSync(f,await r.text());console.log('ok',k);}}
await Promise.all(Array.from({length:4},w));
