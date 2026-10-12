import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-experience-ui-'));
const hash=value=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(value,salt,64).toString('hex');};
fs.writeFileSync(path.join(dir,'family.json'),JSON.stringify({version:1,parent:{passwordHash:hash(crypto.randomBytes(20).toString('hex'))},profiles:[{id:'experience-child',name:'Исследователь',age:9,level:3,pinHash:hash('123456')}],attempts:[],homework:[],settings:{aiEnabled:false,aiModel:''}}));
let server,browser,page,base;const checks=[],errors=[],layouts=[];
const story=JSON.parse(fs.readFileSync(path.join(root,'content/stories.json'))).stories.find(s=>s.id==='moon-garden-map');
async function readyImages(){await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));}
async function layout(label){const r=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(r.scroll<=r.viewport+1,label+' overflow');layouts.push({label,...r});}
async function openStories(){await page.locator('[data-action=stories]').first().click();await page.locator('[data-action=story-open][data-id="'+story.id+'"]').click();await page.locator('.story-stage,.story-ending').waitFor();if(await page.locator('.story-ending').count())await page.locator('[data-action=story-replay]').click();await page.locator('.story-stage').waitFor();}
async function skipLine(){const button=page.locator('[data-action=story-show-line]');if(await button.count())await button.click();}
async function currentScene(id){await page.locator('.story-stage[data-scene="'+id+'"]').waitFor();await skipLine();}
async function advance(scene){await currentScene(scene.id);const choice=scene.question?'[data-action=story-choice][data-choice="'+scene.question.answer+'"]':'.story-continue';await page.locator(choice).click();if(scene.question){await page.locator('.story-advance').waitFor();assert.ok((await page.locator('#story-feedback').innerText()).length);await page.locator('.story-advance').click();}}
async function wallet(){const r=await page.request.get(base+'/api/wallet');assert.equal(r.status(),200);return (await r.json()).balance;}

try{
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,LUMI_HOST:'127.0.0.1',LUMI_PORT:'0',LUMI_DATA_DIR:dir},windowsHide:true,stdio:'pipe'});
 base=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.stdout.on('data',d=>{log+=d;const match=log.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});server.once('exit',c=>reject(Error('Server exit '+c)));});
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base);await page.locator('[data-action=login-profile]').waitFor();assert.equal(await page.locator('[data-action=login-profile]').count(),1);
 assert.match(await page.locator('[data-action=login-profile]').innerText(),/3 класс/);assert.ok(!/лет/.test(await page.locator('[data-action=login-profile]').innerText()));
 await page.locator('[data-action=login-profile]').click();await page.locator('#child-login-form input').fill('123456');await page.locator('#child-login-form [type=submit]').click();await page.locator('.friends-rail').waitFor();
 await readyImages();assert.equal(await page.locator('.friend-card').count(),3);assert.ok((await page.locator('.friend-card[data-friend=mira] img').getAttribute('src')).endsWith('/mira.png'));
 checks.push('No ages on login cards; three decoded character assets and the new book-and-sprout logo');
 await page.evaluate(()=>localStorage.setItem('lumi-palette','mist'));await page.reload();await page.locator('.friends-rail').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'night');
 await readyImages();await page.screenshot({path:path.join(output,'experience-home-night.png'),fullPage:true,animations:'disabled'});await layout('night home desktop');
 const contrast=await page.locator('html').evaluate(e=>{const s=getComputedStyle(e);const color=value=>value.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const luminance=hex=>color(hex.trim().slice(1)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const a=luminance(s.getPropertyValue('--paper')),b=luminance(s.getPropertyValue('--text'));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(contrast>=4.5);
 checks.push('Old mist preference migrates to night; main text on cards meets 4.5:1 contrast');
 await page.locator('.friend-card[data-friend=mira]').click();await page.locator('#friend-line').waitFor();const intro=await page.locator('#friend-line').innerText();await page.locator('[data-action=friend-talk][data-topic=mistakes]').click();assert.notEqual(await page.locator('#friend-line').innerText(),intro);await page.locator('[data-action=close-modal]').click();
 await page.locator('nav [data-view=profile]').click();const style=page.getByRole('combobox',{name:'Оформление',exact:true});await style.click();await page.getByRole('option',{name:'Спокойное',exact:true}).click();assert.equal(await page.locator('[name=style]').inputValue(),'calm');await page.locator('#preferences-form [type=submit]').click();await page.waitForFunction(()=>profile().style==='calm');await page.locator('nav [data-view=home]').click();assert.equal(await page.locator('.friend-card .character').first().evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator('nav [data-view=profile]').click();
 const currentStyle=page.getByRole('combobox',{name:'Оформление',exact:true});await currentStyle.focus();await page.keyboard.press('Home');await page.keyboard.press('Enter');assert.equal(await page.locator('[name=style]').inputValue(),'friendly');
 const explanation=page.getByRole('combobox',{name:'Как объяснять',exact:true});await explanation.focus();await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.locator('[name=explanation]').inputValue(),'short');
 await currentStyle.click();await page.screenshot({path:path.join(output,'experience-dropdown-night.png')});await page.keyboard.press('Escape');assert.equal(await currentStyle.getAttribute('aria-expanded'),'false');await page.locator('#preferences-form [type=submit]').click();await page.waitForFunction(()=>profile().style==='friendly');await page.reload();await page.locator('nav').waitFor();await page.locator('nav [data-view=profile]').click();assert.equal(await page.locator('[name=explanation]').inputValue(),'short');
 checks.push('Friend conversation, custom dropdown mouse and keyboard, Escape and saved preferences');
 await page.locator('nav [data-view=home]').click();const before=await wallet();await openStories();await currentScene(story.scenes[0].id);assert.ok((await page.locator('#novel-line').innerText()).length>20);
 await page.screenshot({path:path.join(output,'experience-novel-night.png'),animations:'disabled'});await advance(story.scenes[0]);await currentScene(story.scenes[1].id);await page.locator('[data-action=close-modal]').click();await page.reload();await page.locator('.friends-rail').waitFor();await openStories();await currentScene(story.scenes[1].id);
 for(const scene of story.scenes.slice(1)){
  await currentScene(scene.id);
  if(scene.question){const wrong=(scene.question.answer+1)%scene.question.options.length;await page.locator('[data-action=story-choice][data-choice="'+wrong+'"]').click();await page.locator('#story-feedback:not([hidden])').waitFor();assert.equal(await page.locator('.story-stage').getAttribute('data-scene'),scene.id);assert.ok((await page.locator('#story-feedback').innerText()).length>20);}
  await advance(scene);
 }
 await page.locator('.story-ending').waitFor();assert.equal(await wallet(),before+6);assert.equal(await page.locator('.wallet-chip [data-balance]').innerText(),String(before+6));
 await page.locator('[data-action=story-replay]').click();for(const scene of story.scenes)await advance(scene);await page.locator('.story-ending').waitFor();assert.equal(await wallet(),before+6);await page.locator('[data-action=close-modal]').click();
 checks.push('Novel dialogue, saved scene after reload, three error hints, six petals once and replay without extra reward');
 await page.setViewportSize({width:320,height:760});await layout('night home 320');await openStories();await currentScene(story.scenes[0].id);await readyImages();await layout('novel 320');await page.screenshot({path:path.join(output,'experience-novel-mobile.png'),fullPage:true,animations:'disabled'});await page.locator('[data-action=close-modal]').click();
 await page.locator('nav [data-view=resources]').click();assert.equal(await page.locator('.resource-card [lang=en]').count(),0);await page.locator('[data-action=book]').first().click();await page.locator('#reader-page[data-rendered="1"] .typeset-page').waitFor();assert.match(await page.locator('.reader-footer').innerText(),/Викитека/);await page.locator('[data-action=book-next]').click();await page.locator('#reader-page[data-rendered="2"]').waitFor();assert.equal(await page.locator('.page-before').count(),1);assert.match(await page.locator('.page-before').evaluate(e=>getComputedStyle(e).animationName),/sheet-out/);await layout('Russian reader 320');await page.locator('.page-before').waitFor({state:'detached'});await page.screenshot({path:path.join(output,'experience-russian-reader-mobile.png'),fullPage:true});await page.locator('[data-action=close-modal]').click();
 checks.push('Russian full text with source and animated outgoing/incoming pages at 320 px');
 await page.locator('[data-action=palette]').click();assert.equal(await page.locator('[data-palette=mist]').count(),0);await page.locator('#motion-toggle').uncheck();await page.locator('[data-action=close-modal]').click();await page.locator('nav [data-view=home]').click();await openStories();assert.equal(await page.locator('[data-action=story-show-line]').count(),0);assert.equal(await page.locator('.story-cast .character').first().evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator('[data-action=close-modal]').click();await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.character').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 checks.push('Motion toggle and OS reduced motion suppress character animations and typing');assert.deepEqual(errors,[]);
 const report={ok:true,version:'0.3.0',verifiedAt:new Date().toISOString(),checks,layouts,textContrast:contrast,errors};fs.writeFileSync(path.join(output,'experience-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page?.screenshot({path:path.join(output,'experience-failure.png'),fullPage:true}).catch(()=>{});console.error(error);console.error(errors);process.exitCode=1;}
finally{await browser?.close();if(server&&!server.killed){server.kill();await new Promise(resolve=>server.once('exit',resolve));}assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('lumi-experience-ui-'));fs.rmSync(dir,{recursive:true,force:true});}
