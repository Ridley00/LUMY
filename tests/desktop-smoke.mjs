import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {playwright} from './playwright-runtime.mjs';
const {_electron:electron}=playwright;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
const userData=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-desktop-test-'));
const executable=process.env.LUMI_EXE?path.resolve(process.env.LUMI_EXE):require('electron');
const packaged=!!process.env.LUMI_EXE;
const password=crypto.randomBytes(18).toString('base64url');
const env={...process.env,LUMI_DESKTOP_TEST:'1',LUMI_DESKTOP_USER_DATA:userData};delete env.ELECTRON_RUN_AS_NODE;
const content=JSON.parse(fs.readFileSync(path.join(root,'content/curriculum.json')));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const errors=[],checks=[];let running,page,origin;
async function launch(){running=await electron.launch({executablePath:executable,args:packaged?[]:[root],env,timeout:45000});page=await running.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('http://127.0.0.1:*/');origin=new URL(page.url()).origin;}
async function request(route){return page.request.get(origin+route);}
async function capture(file){const bytes=await running.evaluate(async({BrowserWindow})=>{const image=await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});return image.toPNG().toString('base64');});assert.ok(bytes.length>1000,'Desktop capture must contain an image');fs.writeFileSync(path.join(output,file),Buffer.from(bytes,'base64'));}
async function assertStopped(url){for(let i=0;i<20;i++){try{await fetch(url+'/api/health',{signal:AbortSignal.timeout(300)});}catch{return true;}await new Promise(r=>setTimeout(r,100));}throw Error('Desktop server did not stop after app closed');}
try{
  await launch();await page.locator('#setup-form').waitFor();
  const runtime=await running.evaluate(({app,BrowserWindow})=>{const prefs=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {version:app.getVersion(),packaged:app.isPackaged,nodeIntegration:prefs.nodeIntegration,contextIsolation:prefs.contextIsolation,sandbox:prefs.sandbox,webSecurity:prefs.webSecurity};});
  assert.equal(runtime.version,version);assert.equal(runtime.packaged,packaged);assert.equal(runtime.nodeIntegration,false);assert.equal(runtime.contextIsolation,true);assert.equal(runtime.sandbox,true);assert.equal(runtime.webSecurity,true);
  const renderer=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process}));assert.deepEqual(renderer,{require:'undefined',process:'undefined'});checks.push('Isolated renderer with sandbox and no Node.js access');
  assert.equal((await (await request('/api/health')).json()).version,version);
  assert.equal(await page.locator('#setup-form [name=pin]').count(),0);
  await page.locator('[name=parentPassword]').fill(password);await page.locator('[name=repeatPassword]').fill(password);await page.locator('#setup-form button[type=submit]').click();await page.getByRole('heading',{name:'Коды детей готовы'}).waitFor();
  const boot=await (await request('/api/bootstrap')).json(),bogdan=boot.profiles.find(p=>p.name==='Богдан');
  const setupPins=await page.locator('.pin-value').evaluateAll(inputs=>inputs.map(i=>i.value));assert.equal(setupPins.length,3);setupPins.forEach(pin=>assert.match(pin,/^\d{6}$/));assert.equal(new Set(setupPins).size,3);
  let bogdanPin=await page.locator(`[data-profile-id="${bogdan.id}"] input`).inputValue();
  await page.getByRole('button',{name:'Готово, коды сохранены'}).click();assert.equal(await page.locator('.pin-value').count(),0);checks.push('First setup generates three distinct six-digit codes and removes them when dismissed');
  await page.locator('nav [data-view=profiles]').click();await page.getByRole('button',{name:'＋ Новый профиль'}).click();await page.locator('#profile-form [name=name]').fill('Тестовый профиль');await page.locator('#profile-form button[type=submit]').click();await page.getByRole('heading',{name:'Код ребёнка готов'}).waitFor();assert.match(await page.locator('.pin-value').inputValue(),/^\d{6}$/);await page.getByRole('button',{name:'Готово, коды сохранены'}).click();checks.push('Adding a profile generates its code without manual entry');
  await page.locator(`[data-action=edit-profile][data-id="${bogdan.id}"]`).click();assert.equal(await page.locator('[name=resetPin]').isChecked(),false);await page.locator('#profile-form [name=age]').fill('9');await page.locator('#profile-form button[type=submit]').click();await page.locator('#profile-form').waitFor({state:'detached'});assert.equal(await page.locator('.pin-value').count(),0);
  await page.locator(`[data-action=edit-profile][data-id="${bogdan.id}"]`).click();await page.locator('[name=resetPin]').check();await page.locator('#profile-form button[type=submit]').click();await page.getByRole('heading',{name:'Код ребёнка готов'}).waitFor();const replacementPin=await page.locator('.pin-value').inputValue();assert.notEqual(replacementPin,bogdanPin);bogdanPin=replacementPin;await page.getByRole('button',{name:'Готово, коды сохранены'}).click();checks.push('Parent explicitly regenerates a code; ordinary profile editing does not regenerate');
  const resources=(await (await request('/api/resources')).json()).resources.filter(r=>r.localFile),files=[];
  for(const resource of resources){const response=await request('/api/library/'+resource.id);assert.equal(response.status(),200);const data=await response.body();const expected=fs.readFileSync(path.join(root,'library',resource.localFile));const sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(sha(data),sha(expected));files.push({file:resource.localFile,bytes:data.length,sha256:sha(data)});}
  assert.equal(files.length,JSON.parse(fs.readFileSync(path.join(root,'content/resources.json'))).resources.filter(r=>r.localFile&&(!packaged||r.bundleInPublicBuild!==false)).length);checks.push('All '+files.length+' bundled library files match their source SHA-256');
  await page.locator('nav [data-view=resources]').click();await page.locator('[data-action=book]').first().click();await page.locator('#reader-page[data-rendered="1"]').waitFor();await page.locator('[data-action=book-next]').click();await page.locator('#reader-page[data-rendered="2"]').waitFor();await page.locator('[data-action=close-modal]').click();const pdfItem=resources.find(r=>r.localFile.endsWith('.pdf'));await page.evaluate(id=>resourceDetail(id),pdfItem.id);await page.locator('[data-action=resource-read]').click();await page.locator('#reader-page[data-rendered="1"]').waitFor();assert.ok(await page.locator('#reader-page canvas').evaluate(c=>c.width>100&&c.height>100));await page.locator('[data-action=close-modal]').click();checks.push('Book pages and bundled PDF.js reader work inside sandboxed Electron');
  const lesson=content.lessons.find(l=>l.level===3);
  await page.locator('nav [data-view=answers]').click();await page.locator('#answers-lesson').selectOption(lesson.id);await page.locator('.answer-key').first().waitFor();
  const popupPromise=running.waitForEvent('window');await page.locator('a[href*="answers=1"]').click();const worksheet=await popupPromise;await worksheet.waitForLoadState();assert.match(await worksheet.locator('h1').innerText(),/Ответы для родителя/);assert.ok((await worksheet.locator('body').innerText()).includes(String(lesson.exercises[0].answer)));await worksheet.close();checks.push('Protected printable worksheet opens in a separate app window');
  await page.locator('[data-action=logout]').click();await page.locator('[data-action=login-profile]').filter({hasText:'Богдан'}).click();await page.locator('#child-login-form input').fill(bogdanPin);await page.locator('#child-login-form button[type=submit]').click();await page.locator('nav [data-view=catalog]').click();await page.locator(`[data-action=open-lesson][data-id="${lesson.id}"]`).click();
  const exercise=lesson.exercises[0],form=page.locator(`[data-exercise="${exercise.id}"]`);if(exercise.type==='choice')await form.locator('input[type=radio]').evaluateAll((nodes,value)=>nodes.find(n=>n.value===value).click(),String(exercise.answer));else await form.locator('[name=answer]').fill(String(exercise.answer));await form.locator('button[type=submit]').click();await form.locator('.feedback.correct').waitFor();
  assert.equal((await request('/api/parent/answers?lesson='+lesson.id)).status(),403);assert.equal((await request('/api/library/'+resources[0].id)).status(),403);checks.push('Child answer checking works and parent endpoints reject child access');
  await page.locator('nav [data-view=home]').click();await capture(packaged?'desktop-packaged.png':'desktop-development.png');
  const previous=await running.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length);await page.evaluate(()=>window.open('file:///C:/Windows/win.ini'));assert.equal(await running.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),previous);checks.push('Untrusted new window is blocked');
  const oldOrigin=origin;await running.close();running=null;await assertStopped(oldOrigin);checks.push('Closing desktop app stops its local server');
  await launch();await page.locator('[data-action=login-profile]').filter({hasText:'Богдан'}).waitFor();assert.equal((await (await request('/api/bootstrap')).json()).profiles.length,4);assert.ok(fs.existsSync(path.join(userData,'data/family.json')));await page.locator('[data-action=login-profile]').filter({hasText:'Богдан'}).click();await page.locator('#child-login-form input').fill(bogdanPin);await page.locator('#child-login-form button[type=submit]').click();await page.locator('nav').waitFor();checks.push('Family data and generated child login persist after application restart');
  assert.deepEqual(errors,[]);const report={ok:true,verifiedAt:new Date().toISOString(),executable,runtime,renderer,checks,files,errors};fs.writeFileSync(path.join(output,packaged?'desktop-packaged-report.json':'desktop-development-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,runtime,renderer,checks,files:files.length,errors},null,2));
}catch(error){console.error(error);process.exitCode=1;}
finally{await running?.close();if(path.basename(userData).startsWith('lumi-desktop-test-')&&path.dirname(userData)===os.tmpdir()){for(let i=0;i<10;i++){try{fs.rmSync(userData,{recursive:true,force:true});break;}catch{await new Promise(r=>setTimeout(r,200));}}}}
