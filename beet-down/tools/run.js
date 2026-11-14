// usage: node run.js jobs.json outdir
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const {spawn}=require('child_process');
(async()=>{
  const jobs=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const out=process.argv[3]; fs.mkdirSync(out,{recursive:true});
  const srv=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:__dirname,stdio:'ignore'});
  await new Promise(r=>setTimeout(r,800));
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}); const pg=await b.newPage();
  pg.on('pageerror',e=>console.log('ERR',e.message)); pg.on('console',m=>{if(m.type()==='error')console.log('CERR',m.text())});
  await pg.goto('http://127.0.0.1:8765/render.html'); await pg.waitForFunction(()=>window.ready);
  for(const j of jobs){
    try{const url=await pg.evaluate(j=>window.renderJob(j),j);fs.writeFileSync(path.join(out,j.name+'.png'),Buffer.from(url.split(',')[1],'base64'))}
    catch(e){console.log('FAIL',j.name,e.message.slice(0,200))}
  }
  await b.close(); srv.kill();
})();
