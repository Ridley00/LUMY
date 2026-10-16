import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
import {playwright} from './playwright-runtime.mjs';
const {chromium}=playwright;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-browser-'));
const content=JSON.parse(fs.readFileSync(path.join(root,'content/curriculum.json')));
const password=crypto.randomBytes(18).toString('base64url');
const errors=[],checks=[],layouts=[];
let browser,server,page;
async function widthCheck(label){const result=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='absolute').slice(0,6).map(e=>e.tagName+'.'+e.className)}));layouts.push({label,...result});assert.ok(result.document<=result.width+1,`${label}: horizontal overflow ${JSON.stringify(result)}`);}
async function childLogin(name,pin){await page.locator('[data-action=login-profile]').filter({hasText:name}).click();await page.locator('#child-login-form input').fill(pin);await page.locator('#child-login-form button[type=submit]').click();await page.locator('nav').waitFor();}
async function parentLogin(){await page.locator('[data-action=parent-login]').click();await page.locator('#parent-login-form input').fill(password);await page.locator('#parent-login-form button[type=submit]').click();await page.getByRole('heading',{name:'Семейный обзор'}).waitFor();}
async function answer(form,exercise){if(exercise.type==='choice')await form.locator('input[type=radio]').evaluateAll((els,value)=>{const el=els.find(e=>e.value===value);if(!el)throw Error('Choice absent');el.click();},String(exercise.answer));else await form.locator('[name=answer]').fill(String(exercise.answer));}
try{
  const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,LUMI_PORT:String(port),LUMI_HOST:'127.0.0.1',LUMI_DATA_DIR:dataDir},stdio:'pipe',windowsHide:true});
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,80));}
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1365,height:1000}});page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.locator('#setup-form').waitFor();
  await page.screenshot({path:path.join(output,'setup-desktop.png'),fullPage:true});await widthCheck('setup desktop');
  await page.locator('[name=parentPassword]').fill(password);await page.locator('[name=repeatPassword]').fill(password);
  assert.equal(await page.locator('#setup-form [name=pin]').count(),0);
  await page.locator('#setup-form button[type=submit]').click();await page.getByRole('heading',{name:'Коды детей готовы'}).waitFor();
  const pins=await page.locator('.pin-value').evaluateAll(inputs=>inputs.map(i=>i.value));assert.equal(pins.length,3);pins.forEach(pin=>assert.match(pin,/^\d{6}$/));assert.equal(new Set(pins).size,3);
  await widthCheck('generated codes desktop');await page.setViewportSize({width:320,height:760});await widthCheck('generated codes 320');await page.screenshot({path:path.join(output,'generated-codes-mobile.png'),fullPage:true});await page.setViewportSize({width:1365,height:1000});
  await page.getByRole('button',{name:'Готово, коды сохранены'}).click();assert.equal(await page.locator('.pin-value').count(),0);checks.push('Family setup with three editable profiles and automatic six-digit codes');
  await page.locator('[data-action=logout]').click();await childLogin('Богдан',pins[0]);
  await page.screenshot({path:path.join(output,'child-desktop.png'),fullPage:true});await widthCheck('child desktop');
  await page.locator('nav [data-view=catalog]').click();await page.locator('#level-filter').waitFor();assert.equal(await page.locator('#level-filter').inputValue(),'3');
  await page.locator('#level-filter').selectOption('all');assert.equal(await page.locator('a[href^="/worksheet?"]').count(),0);await page.locator('#level-filter').selectOption('3');const lesson=content.lessons.find(l=>l.level===3);await page.locator(`[data-action=open-lesson][data-id="${lesson.id}"]`).click();
  const form=page.locator(`form[data-exercise="${lesson.exercises[0].id}"]`);await form.waitFor();await form.locator('[data-action=hint]').click();await form.locator('.hint').waitFor();await answer(form,lesson.exercises[0]);await form.locator('button[type=submit]').click();await form.locator('.feedback.correct').waitFor();checks.push('Lesson, scaffold hint and checked answer');
  await page.locator('nav [data-view=homework]').click();await page.locator('[name=task]').fill('Вычислить 24 : 3.');await page.locator('[name=steps]').fill('24:3=9');await page.locator('[name=photo]').setInputFiles(path.join(root,'public/assets/lumi.webp'));await page.locator('#world-homework button[type=submit]').click();await page.locator('.work-item .status').filter({hasText:'Есть что исправить'}).waitFor();checks.push('Homework saved with photo and detected arithmetic error');
  await page.locator('nav [data-view=tests]').click();await page.locator(`[data-action=start-test][data-id="${lesson.id}"]`).click();
  for(const ex of lesson.exercises){const f=page.locator('#test-form');await answer(f,ex);await f.locator('button[type=submit]').click();await f.locator('[data-action=next-test]').waitFor({state:'visible'});await f.locator('[data-action=next-test]').click();}
  await page.getByRole('heading',{name:'Верных ответов: 3 из 3'}).waitFor();checks.push('Three-question self-test completed');
  await page.locator('nav [data-view=profile]').click();await page.locator('[name=explanation]').selectOption('examples');await page.locator('[name=interests]').fill('Космос, животные');await page.locator('#preferences-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Сохранено.');await page.reload();await page.locator('nav').waitFor();await page.locator('nav [data-view=profile]').click();assert.equal(await page.locator('[name=interests]').inputValue(),'Космос, животные');checks.push('Preferences survive reload');
  await page.locator('[data-action=logout]').click();await parentLogin();await page.locator('nav [data-view=review]').click();await page.locator('.review-form [name=verdict]').selectOption('retry');await page.locator('.review-form [name=feedback]').fill('Проверь: сколько троек помещается в 24?');await page.locator('.review-form button[type=submit]').click();await page.locator('.work-item .status').filter({hasText:'Нужно доработать'}).waitFor();
  assert.equal(await page.locator('.review-form [name=verdict]').inputValue(),'retry');await page.locator('.review-form [name=feedback]').fill('Дополненный комментарий.');await page.locator('.review-form button[type=submit]').click();await page.locator('.work-item .status').filter({hasText:'Нужно доработать'}).waitFor();await page.locator('nav [data-view=answers]').click();await page.locator('#answers-lesson').selectOption(lesson.id);await page.locator('.answer-key').first().waitFor();checks.push('Parent review and protected solutions');
  await page.locator('nav [data-view=resources]').click();await page.locator('[data-action=resource]').first().click();await page.locator('.reading-article').waitFor();await page.locator('[data-action=close-modal]').click();await page.locator('nav [data-view=settings]').click();await page.getByRole('heading',{name:'Локальный ИИ через Ollama'}).waitFor();
  await page.locator('[data-action=logout]').click();await childLogin('Полина',pins[1]);await page.locator('nav [data-view=homework]').click();assert.equal(await page.locator('.work-item').count(),0);checks.push('Sibling homework isolation in UI');
  await page.locator('[data-action=logout]').click();await childLogin('Алена',pins[2]);assert.equal(await page.locator('.pre-school').count(),1);await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'preschool-mobile.png'),fullPage:true});await widthCheck('preschool 390');
  await page.setViewportSize({width:320,height:760});await widthCheck('preschool 320');
  for(const view of ['catalog','tests','homework','resources','profile','tutor']){await page.locator('nav [data-view='+view+']').click();await widthCheck(view+' 320');}
  await page.locator('nav [data-view=catalog]').click();await page.locator('[data-action=open-lesson]').first().click();await page.locator('[data-action=speak]').first().waitFor();await widthCheck('lesson 320');
  await page.locator('[data-action=palette]').click();await page.locator('[data-palette=night]').click();await page.locator('[data-action=close-modal]').click();await page.screenshot({path:path.join(output,'preschool-night-320.png'),fullPage:true});checks.push('Preschool large controls, read-aloud button and responsive night palette');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({ok:true,checks,layouts,errors},null,2));console.log(JSON.stringify({ok:true,checks,layouts,errors},null,2));
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await browser?.close();if(server&&!server.killed){server.kill();await new Promise(r=>server.once('exit',r));}if(path.basename(dataDir).startsWith('lumi-browser-')&&path.dirname(dataDir)===os.tmpdir())fs.rmSync(dataDir,{recursive:true,force:true});}
