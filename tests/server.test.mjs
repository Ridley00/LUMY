import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-api-test-'));
const data=JSON.parse(fs.readFileSync(path.join(root,'content/curriculum.json')));
const resources=JSON.parse(fs.readFileSync(path.join(root,'content/resources.json'))).resources;
let child,base,parent,bogdan,polina,homework,port;
async function call(route,{session,body,headers={}}={}){
  const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await r.text();let value;try{value=JSON.parse(raw);}catch{value=raw;}
  return {status:r.status,value,raw,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
}
const session=r=>({...r.value.session,cookie:r.cookie});
before(async()=>{
  const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,LUMI_PORT:String(port),LUMI_HOST:'127.0.0.1',LUMI_DATA_DIR:dir},windowsHide:true,stdio:'pipe'});
  for(let i=0;i<60;i++){try{if((await call('/api/health')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,80));}throw Error('Test server did not start');
});
after(async()=>{if(child&&!child.killed){child.kill();await new Promise(r=>child.once('exit',r));}if(path.basename(dir).startsWith('lumi-api-test-')&&path.dirname(dir)===os.tmpdir())fs.rmSync(dir,{recursive:true,force:true});});
test('setup, sessions, role protection, profile isolation and saved review',async()=>{
  assert.equal((await call('/api/parent/dashboard')).status,401);
  assert.equal((await call('/api/setup',{body:{password:'abcdefghijk',profiles:[{name:'Богдан',level:3,pin:'1234'},{name:'Полина',level:4,pin:'5678'}]},headers:{Origin:'https://foreign.invalid'}})).status,403);
  const setup=await call('/api/setup',{body:{password:'test-password-8365',profiles:[{name:'Богдан',level:3},{name:'Полина',level:4}]}});assert.equal(setup.status,201);parent=session(setup);
  assert.equal(setup.value.generatedCodes.length,2);for(const c of setup.value.generatedCodes)assert.match(c.pin,/^\d{6}$/);assert.equal(new Set(setup.value.generatedCodes.map(c=>c.pin)).size,2);
  assert.match(setup.headers.get('set-cookie'),/HttpOnly/);assert.match(setup.headers.get('set-cookie'),/SameSite=Strict/);
  const boot=(await call('/api/bootstrap')).value;assert.ok(!JSON.stringify(boot).includes('Hash'));
  assert.ok(!JSON.stringify(boot).includes('generatedCodes'));assert.ok(boot.profiles.every(p=>!Object.hasOwn(p,'pin')));
  bogdan=session(await call('/api/login',{body:{role:'child',profileId:boot.profiles[0].id,pin:setup.value.generatedCodes.find(c=>c.profileId===boot.profiles[0].id).pin}}));
  polina=session(await call('/api/login',{body:{role:'child',profileId:boot.profiles[1].id,pin:setup.value.generatedCodes.find(c=>c.profileId===boot.profiles[1].id).pin}}));
  const lesson=data.lessons.find(l=>l.level===3),ex=lesson.exercises[0];
  const safe=(await call('/api/lessons/'+lesson.id,{session:bogdan})).value;
  for(const e of safe.exercises)for(const k of ['answer','accepted','solution','tolerance'])assert.equal(Object.hasOwn(e,k),false,k);
  assert.equal((await call('/api/parent/answers?lesson='+lesson.id,{session:bogdan})).status,403);
  assert.equal((await call('/api/parent/profiles',{session:bogdan,body:{name:'Hack',level:11,pin:'9876'}})).status,403);
  assert.equal((await call('/worksheet?level=3&answers=1',{session:bogdan})).status,403);
  assert.equal((await call('/worksheet?level=3',{session:bogdan})).status,200);
  const keys=await call('/api/parent/answers?lesson='+lesson.id,{session:parent});assert.equal(keys.value.exercises[0].answer,ex.answer);
  const csrf=await call('/api/exercises/'+ex.id+'/check',{session:bogdan,headers:{'X-CSRF-Token':'wrong'},body:{answer:ex.answer}});assert.equal(csrf.status,403);
  const attempt=await call('/api/exercises/'+ex.id+'/check',{session:bogdan,body:{answer:ex.answer}});assert.equal(attempt.value.correct,true);assert.equal(Object.hasOwn(attempt.value,'answer'),false);
  assert.equal((await call('/api/catalog',{session:polina})).value.lessons.find(l=>l.id===lesson.id).correctCount,0);
  assert.equal((await call('/api/catalog',{session:bogdan})).value.lessons.find(l=>l.id===lesson.id).correctCount,1);
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1EAAAAASUVORK5CYII=';
  homework=(await call('/api/homework',{session:bogdan,body:{task:'Проверить деление',steps:'24:3=9',photo}})).value;assert.equal(homework.status,'needs_correction');
  assert.equal((await call('/api/homework',{session:polina})).value.items.length,0);
  assert.equal((await call('/api/homework/'+homework.id+'/photo',{session:polina})).status,403);
  assert.equal((await call('/api/homework/'+homework.id+'/photo',{session:bogdan})).status,200);
  assert.equal((await call('/api/parent/reviews/'+homework.id,{session:bogdan,body:{verdict:'ready'}})).status,403);
  assert.equal((await call('/api/parent/reviews/'+homework.id,{session:parent,body:{verdict:'retry',feedback:'Посчитай ещё раз.'}})).status,200);
  assert.equal((await call('/api/homework',{session:bogdan})).value.items[0].review.feedback,'Посчитай ещё раз.');
  const prefs=await call('/api/preferences',{session:bogdan,body:{style:'calm',explanation:'examples',interests:['Космос'],level:11,role:'parent'}});assert.equal(prefs.value.profile.level,3);assert.equal(prefs.value.profile.explanation,'examples');
  const file=resources.find(r=>r.localFile);
  assert.equal((await call('/api/library/'+file.id,{session:bogdan})).status,403);
  assert.equal((await call('/api/library/'+file.id,{session:parent})).status,200);
  const list=await call('/api/resources',{session:bogdan});assert.ok(!list.raw.includes('localFile'));assert.ok(!list.raw.includes('https://'));
  for(const route of ['/content/curriculum.json','/data/family.json','/library/'+file.localFile,'/server.mjs'])assert.equal((await call(route,{session:bogdan})).status,404);
  assert.equal((await call('/api/tutor',{session:bogdan,body:{message:'Привет'}})).status,409);
  assert.equal((await call('/api/homework',{session:bogdan,body:{task:'x',photo:'data:image/png;base64,YmFk'}})).status,400);
  assert.equal((await call('/api/logout',{session:parent,body:{}})).status,200);
  assert.equal((await call('/api/parent/dashboard',{session:parent})).status,401);
  const stored=JSON.parse(fs.readFileSync(path.join(dir,'family.json')));assert.equal(stored.homework.length,1);assert.ok(!JSON.stringify(stored).includes('test-password-8365'));
});
test('rejects foreign Host before serving local content',async()=>{
  const result=await new Promise((resolve,reject)=>{http.get(base+'/api/health',{headers:{Host:'attacker.invalid:'+port}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(result,403);
});

test('generated codes support new profiles, keep existing codes and rotate only for a parent',async()=>{
  parent=session(await call('/api/login',{body:{role:'parent',password:'test-password-8365'}}));
  const create=await call('/api/parent/profiles',{session:parent,body:{name:'Новый ребёнок',age:6,level:0}});
  assert.equal(create.status,200);assert.match(create.value.generatedPin,/^\d{6}$/);
  const p=create.value.profile,pin=create.value.generatedPin;
  const login=async pin=>call('/api/login',{body:{role:'child',profileId:p.id,pin}});
  const first=await login(pin);assert.equal(first.status,200);const childSession=session(first);
  assert.equal((await call('/api/parent/profiles',{session:childSession,body:{...p,resetPin:true}})).status,403);
  assert.equal((await call('/api/parent/profiles',{session:parent,headers:{'X-CSRF-Token':'wrong'},body:{...p,resetPin:true}})).status,403);
  const readStored=()=>JSON.parse(fs.readFileSync(path.join(dir,'family.json')));
  const originalHash=readStored().profiles.find(item=>item.id===p.id).pinHash;
  const edit=await call('/api/parent/profiles',{session:parent,body:{...p,level:1,resetPin:false}});
  assert.equal(edit.status,200);assert.equal(Object.hasOwn(edit.value,'generatedPin'),false);assert.equal(readStored().profiles.find(item=>item.id===p.id).pinHash,originalHash);
  const second=await login(pin);assert.equal(second.status,200);
  const rotate=await call('/api/parent/profiles',{session:parent,body:{...p,level:1,resetPin:true}});
  assert.equal(rotate.status,200);assert.match(rotate.value.generatedPin,/^\d{6}$/);assert.notEqual(rotate.value.generatedPin,pin);
  assert.equal((await call('/api/catalog',{session:session(second)})).status,401);
  assert.equal((await login(pin)).status,401);assert.equal((await login(rotate.value.generatedPin)).status,200);
  for(const route of ['/api/bootstrap','/api/parent/dashboard']){
    const value=(await call(route,{session:parent})).value;
    assert.ok(!JSON.stringify(value).includes('generatedPin'));assert.ok(value.profiles.every(p=>!Object.hasOwn(p,'pin')&&!Object.hasOwn(p,'pinHash')));
  }
  const legacy=await call('/api/parent/profiles',{session:parent,body:{name:'Прежний профиль',level:4,pin:'0042'}});
  assert.equal(legacy.status,200);assert.equal(Object.hasOwn(legacy.value,'generatedPin'),false);
  await call('/api/parent/profiles',{session:parent,body:{...legacy.value.profile,age:10}});
  assert.equal((await call('/api/login',{body:{role:'child',profileId:legacy.value.profile.id,pin:'0042'}})).status,200);
  const stored=readStored();
  for(const profile of stored.profiles){assert.match(profile.pinHash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);assert.ok(!Object.hasOwn(profile,'pin'));assert.ok(!Object.hasOwn(profile,'generatedPin'));}
  assert.ok(!Object.hasOwn(stored,'generatedCodes'));
});
