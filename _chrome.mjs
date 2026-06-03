import http from 'node:http'; import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'.'); const PORT=8913;
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer(async(rq,rs)=>{try{let p=decodeURIComponent(rq.url.split('?')[0]);if(p==='/')p='/index.html';const f=normalize(join(ROOT,p));if(!f.startsWith(ROOT)){rs.writeHead(403);return rs.end();}const b=await readFile(f);rs.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});rs.end(b);}catch{rs.writeHead(404);rs.end('nf');}});
await new Promise(r=>server.listen(PORT,r));
let b;
try{ b=await chromium.launch({channel:'chrome', headless:false}); }
catch(e){ console.log('chrome channel launch failed:', e.message.split('\n')[0]); server.close(); process.exit(0); }
const ctx=await b.newContext({viewport:{width:800,height:560}, acceptDownloads:true});
const pg=await ctx.newPage();
await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'load'});
await pg.waitForFunction(()=>window.__engine,null,{timeout:30000});
await pg.evaluate(async()=>{ const st=window.__tool.state; st.duration=1.5; st.exportFps=20; window.__engine.setSize(256,160); window.__engine.resize(); window.__engine.setMode(50); window.__engine.scrub(0); await new Promise(s=>setTimeout(s,300)); });
const dlP=pg.waitForEvent('download',{timeout:60000}).catch(()=>null);
const ret=await pg.evaluate(async()=>{ try{ await window.__engine.startRecording({filename:'m50_test'}); return 'called'; }catch(e){ return 'threw:'+e.message; } });
const dl=await dlP;
if(dl){ await dl.saveAs('/tmp/m50_chrome.mp4'); const fs=await import('node:fs'); console.log('DOWNLOAD ok:', fs.statSync('/tmp/m50_chrome.mp4').size,'bytes'); }
else console.log('no download. startRecording returned:', ret);
await b.close(); server.close();
