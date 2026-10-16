import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
import {playwright} from './playwright-runtime.mjs';
const {_electron:electron}=playwright;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-output');
const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'lumi-demo-check-'));
const userData=path.join(testDir,'demo');
const guestId=crypto.randomUUID(),pin=String(crypto.randomInt(100000,1000000));
function hash(value){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(value,salt,64).toString('hex');}
fs.mkdirSync(path.join(userData,'data'),{recursive:true});
fs.writeFileSync(path.join(userData,'data/family.json'),JSON.stringify({version:1,parent:{passwordHash:hash(crypto.randomBytes(20).toString('hex')),createdAt:new Date().toISOString()},profiles:[{id:guestId,name:'Гость',age:9,level:3,pinHash:hash(pin),style:'friendly',explanation:'steps',interests:[]}],attempts:[],homework:[],settings:{aiEnabled:false,aiModel:''}}));
const packaged=!!process.env.LUMI_EXE,executable=packaged?path.resolve(process.env.LUMI_EXE):require('electron');
const env={...process.env,LUMI_DESKTOP_TEST:'1',LUMI_DESKTOP_USER_DATA:userData};delete env.ELECTRON_RUN_AS_NODE;
const checks=[],errors=[];let app,page,origin;
async function launch(){app=await electron.launch({executablePath:executable,args:[...(packaged?[]:[root]),'--demo'],env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('http://127.0.0.1:*/');origin=new URL(page.url()).origin;await page.getByRole('button',{name:/Гость/}).waitFor();}
async function login(){await page.getByRole('button',{name:/Гость/}).click();await page.locator('#child-login-form [name=pin]').fill(pin);await page.locator('#child-login-form button[type=submit]').click();await page.getByRole('button',{name:'Сменить профиль',exact:true}).waitFor();}
try{
  await launch();
  const runtime=await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),packaged:app.isPackaged,userData:app.getPath('userData'),host:process.env.LUMI_HOST,title:BrowserWindow.getAllWindows()[0].getTitle(),preferences:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()}));
  assert.equal(runtime.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version);assert.equal(runtime.packaged,packaged);assert.equal(runtime.userData,userData);assert.equal(runtime.host,'127.0.0.1');assert.equal(runtime.title,'Луми · Тестовый кабинет');assert.equal(runtime.preferences.nodeIntegration,false);assert.equal(runtime.preferences.contextIsolation,true);assert.equal(runtime.preferences.sandbox,true);
  const boot=await (await page.request.get(origin+'/api/bootstrap')).json();assert.equal(boot.demo,true);assert.equal(boot.profiles.length,1);assert.equal(boot.profiles[0].name,'Гость');assert.equal(await page.locator('.brand-sub').innerText(),'Тестовый кабинет');checks.push('Demo is visibly labelled, bound to loopback and uses isolated data');
  await login();assert.equal((await page.request.get(origin+'/api/parent/dashboard')).status(),403);checks.push('Guest code opens the child cabinet; parent endpoints stay protected');
  await page.locator('nav [data-view=homework]').click();await page.locator('[name=task]').fill('Вычислить 24 : 3');await page.locator('[name=steps]').fill('24 : 3 = 9');await page.locator('#world-homework button[type=submit]').click();await page.locator('.work-item .status').filter({hasText:'Есть что исправить'}).waitFor();checks.push('Homework checking works in the desktop demo');
  await page.locator('nav [data-view=home]').click();await page.getByRole('heading',{name:/Привет, Гость!/}).waitFor();
  const capture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));
  fs.writeFileSync(path.join(output,packaged?'desktop-demo-packaged.png':'desktop-demo-development.png'),Buffer.from(capture,'base64'));
  await app.close();app=null;await launch();await login();await page.locator('nav [data-view=homework]').click();await page.locator('.work-item').waitFor();checks.push('Demo work and guest login survive a restart');
  assert.deepEqual(errors,[]);
  const report={ok:true,version:runtime.version,packaged,host:runtime.host,checks,errors};fs.writeFileSync(path.join(output,packaged?'desktop-demo-packaged-report.json':'desktop-demo-development-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error);process.exitCode=1;}
finally{await app?.close();if(path.dirname(testDir)===os.tmpdir()&&path.basename(testDir).startsWith('lumi-demo-check-')){for(let i=0;i<10;i++){try{fs.rmSync(testDir,{recursive:true,force:true});break;}catch{await new Promise(r=>setTimeout(r,200));}}}}
