import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Ollama adapter keeps bounded per-session context and excludes answer keys',async()=>{
  const requests=[],dir=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-ai-test-'));let app;
  const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;res.setHeader('Content-Type','application/json');if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'test-local'},{name:'test-cloud'}]}));if(req.url==='/api/chat'){requests.push(JSON.parse(raw));return res.end(JSON.stringify({message:{content:'Посчитаем по шагам.'}}));}res.writeHead(404).end();});
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));const ollama='http://127.0.0.1:'+mock.address().port;
  const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
  async function call(route,s,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();return {status:r.status,...value,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const auth=r=>({...r.session,cookie:r.cookie});
  try{
    app=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,LUMI_PORT:String(port),LUMI_DATA_DIR:dir,LUMI_OLLAMA_URL:ollama,LUMI_HOST:'127.0.0.1'},stdio:'pipe',windowsHide:true});
    for(let i=0;i<60;i++){try{if((await call('/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,80));}
    const parent=auth(await call('/api/setup',null,{password:'only-test-123456',profiles:[{name:'Тест',age:9,level:3,pin:'1234',interests:['Космос'],explanation:'examples'},{name:'Второй',level:4,pin:'5678'}]}));
    const boot=await call('/api/bootstrap');const one=auth(await call('/api/login',null,{profileId:boot.profiles[0].id,pin:'1234'}));const two=auth(await call('/api/login',null,{profileId:boot.profiles[1].id,pin:'5678'}));
    const models=await call('/api/parent/ai',parent);assert.deepEqual(models.models,['test-local']);assert.equal((await call('/api/parent/ai',one,{enabled:true,model:'test-local'})).status,403);
    assert.equal((await call('/api/parent/ai',parent,{enabled:true,model:'test-local'})).status,200);
    assert.equal((await call('/api/tutor',one,{message:'Как разделить 24 на 3?'})).reply,'Посчитаем по шагам.');await call('/api/tutor',one,{message:'Почему?'});
    assert.equal(requests[1].messages.length,4);assert.equal(requests[1].messages[1].content,'Как разделить 24 на 3?');assert.match(requests[1].messages[0].content,/Космос/);assert.match(requests[1].messages[0].content,/небольшие примеры/);
    assert.ok(!JSON.stringify(requests).includes('pinHash'));assert.ok(!JSON.stringify(requests).includes('solution'));
    const status=await call('/api/tutor/status',one);assert.equal(status.history.length,4);assert.equal((await call('/api/tutor/status',two)).history.length,0);
    await call('/api/tutor',two,{message:'Мой вопрос'});assert.equal(requests[2].messages.length,2);
    await call('/api/tutor/reset',one,{});assert.equal((await call('/api/tutor/status',one)).history.length,0);
    await call('/api/tutor',one,{message:'Новый вопрос'});assert.equal(requests[3].messages.length,2);
  }finally{if(app&&!app.killed){app.kill();await new Promise(r=>app.once('exit',r));}await new Promise(r=>mock.close(r));if(path.basename(dir).startsWith('lumi-ai-test-')&&path.dirname(dir)===os.tmpdir())fs.rmSync(dir,{recursive:true,force:true});}
});
