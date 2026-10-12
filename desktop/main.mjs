import {app,BrowserWindow,Menu,dialog,session,shell} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const testMode=process.env.LUMI_DESKTOP_TEST==='1';
const demoMode=process.argv.includes('--demo');
const customTestDir=process.env.LUMI_DESKTOP_USER_DATA;
if(testMode&&(!customTestDir||!path.isAbsolute(customTestDir)))throw Error('Desktop tests require an absolute isolated user-data path.');
app.setName('Луми');
app.setPath('userData',testMode?customTestDir:path.join(app.getPath('appData'),demoMode?'Lumi-Demo':'Lumi'));
app.setAppUserModelId(demoMode?'family.lumi.study.demo':'family.lumi.study');

let mainWindow,engine,origin,serverPort;
const webPreferences={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false};
const localContent=file=>{try{return JSON.parse(fs.readFileSync(path.join(root,'content',file),'utf8'));}catch{return {};}};
const knownLinks=new Set(['https://ollama.com/',...localContent('resources.json').resources.map(r=>r.url),...(localContent('parent-articles.json').articles||[]).flatMap(a=>a.sources.map(s=>s.url)),...(localContent('courses.json').courses||[]).flatMap(c=>c.sourceLinks.map(s=>s.url)),...['books.json','russian-books.json'].flatMap(file=>(localContent(file).books||[]).flatMap(b=>[b.sourceUrl,b.sourcePermanentUrl,b.licenseUrl,b.coverLicenseUrl]))].filter(Boolean).map(v=>new URL(v).href));
const isLocal=value=>{try{return new URL(value).origin===origin;}catch{return false;}};
const canOpenExternal=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&knownLinks.has(url.href);}catch{return false;}};
function external(value){if(canOpenExternal(value))void shell.openExternal(value).catch(()=>{});}

function guardWindow(win){
  win.setMenuBarVisibility(false);
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('will-navigate',(event,url)=>{if(!isLocal(url)){event.preventDefault();external(url);}});
  win.webContents.on('will-redirect',(event,url)=>{if(!isLocal(url))event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>{
    if(isLocal(url)&&(new URL(url).pathname==='/worksheet'||/^\/certificate\/[a-f0-9-]+$/.test(new URL(url).pathname)))return {action:'allow',overrideBrowserWindowOptions:{width:1000,height:800,title:'Луми - материалы',show:!testMode,autoHideMenuBar:true,icon:path.join(root,'desktop/assets/lumi-mark.ico'),webPreferences}};
    external(url);return {action:'deny'};
  });
  win.webContents.on('did-create-window',child=>guardWindow(child));
  win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.control&&input.key.toLowerCase()==='p'){event.preventDefault();win.webContents.print({printBackground:true});}});
}

function createWindow(){
  mainWindow=new BrowserWindow({width:1440,height:980,minWidth:760,minHeight:620,title:demoMode?'Луми · Тестовый кабинет':'Луми',backgroundColor:'#f2e6d6',show:false,autoHideMenuBar:false,icon:path.join(root,'desktop/assets/lumi-mark.ico'),webPreferences});
  if(demoMode)mainWindow.on('page-title-updated',event=>event.preventDefault());
  guardWindow(mainWindow);mainWindow.setMenuBarVisibility(true);
  mainWindow.once('ready-to-show',()=>{if(!testMode)mainWindow.show();});
  mainWindow.on('closed',()=>{mainWindow=null;});
  void mainWindow.loadURL(origin+'/');
}

function createMenu(){
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Луми',submenu:[
      ...(demoMode?[{label:'Тестовый кабинет: отдельные данные',enabled:false},{type:'separator'}]:[]),
      {label:'На главную',accelerator:'Ctrl+Home',click:()=>{mainWindow?.loadURL(origin+'/');}},
      {label:'Печать',accelerator:'Ctrl+P',click:()=>BrowserWindow.getFocusedWindow()?.webContents.print({printBackground:true})},
      {type:'separator'},{label:'Выйти из приложения',role:'quit'}
    ]},
    {label:'Правка',submenu:[{label:'Отменить',role:'undo'},{label:'Повторить',role:'redo'},{type:'separator'},{label:'Вырезать',role:'cut'},{label:'Копировать',role:'copy'},{label:'Вставить',role:'paste'},{label:'Выделить всё',role:'selectAll'}]},
    {label:'Вид',submenu:[{label:'Обновить страницу',role:'reload'},{type:'separator'},{label:'Увеличить',role:'zoomIn'},{label:'Уменьшить',role:'zoomOut'},{label:'Обычный масштаб',role:'resetZoom'},{label:'Полный экран',role:'togglefullscreen'}]},
    {label:'Справка',submenu:[
      {label:'Подключить Android',enabled:!demoMode,click:()=>{const addresses=Object.values(os.networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>`http://${n.address}:${serverPort}`);dialog.showMessageBox(mainWindow,{type:'info',title:'Луми на телефоне',message:'Открой адрес в браузере Android',detail:`Телефон и компьютер должны быть в одной домашней сети. Оставь Луми открытым на компьютере.\n\n${addresses.join('\n')||'Адрес домашней сети пока не найден.'}\n\nПервую настройку семьи выполни в окне Луми на компьютере.`,buttons:['Понятно']});}},
      {label:'О приложении',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'О Луми',message:`Луми ${app.getVersion()}`,detail:'Семейное учебное пространство\nТемы, тренировки, книги, курсы и семейные подарки.\n\nЭто стартовая подборка, не полная школьная программа. Электронные дневники и реальная модель ИИ пока не подключены.',buttons:['Понятно']})}
    ]}
  ]));
}

async function availablePort(){
  const candidate=net.createServer();
  try{await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(testMode?0:demoMode?3479:3478,'127.0.0.1',resolve);});const port=candidate.address().port;await new Promise(r=>candidate.close(r));return port;}
  catch(error){if(error.code!=='EADDRINUSE')throw error;const fallback=net.createServer();await new Promise((resolve,reject)=>{fallback.once('error',reject);fallback.listen(0,'127.0.0.1',resolve);});const port=fallback.address().port;await new Promise(r=>fallback.close(r));return port;}
}

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{engine?.server.closeAllConnections();engine?.server.close();});
  app.whenReady().then(async()=>{
    app.userAgentFallback=app.userAgentFallback.replaceAll('Луми','Lumi');
    process.env.LUMI_DATA_DIR=path.join(app.getPath('userData'),'data');
    process.env.LUMI_LIBRARY_DIR=app.isPackaged?path.join(process.resourcesPath,'library'):path.join(root,'library');
    process.env.LUMI_PORT=String(await availablePort());
    process.env.LUMI_HOST=testMode||demoMode?'127.0.0.1':'0.0.0.0';
    process.env.LUMI_DEMO_MODE=demoMode?'1':'0';
    session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.on('will-download',(event,item)=>{if(!isLocal(item.getURL())||!new URL(item.getURL()).pathname.startsWith('/api/library/')){event.preventDefault();return;}item.setSaveDialogOptions({title:'Сохранить материал Луми',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});});
    engine=await import('../server.mjs');const address=await engine.ready;serverPort=address.port;origin=`http://127.0.0.1:${serverPort}`;
    createMenu();createWindow();
    if(testMode||demoMode){fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(path.join(app.getPath('userData'),'desktop-ready.json'),JSON.stringify({pid:process.pid,origin,version:app.getVersion(),packaged:app.isPackaged,demo:demoMode,webPreferences}));}
  }).catch(error=>{if(testMode)console.error(error);else dialog.showErrorBox('Луми не смог запуститься',error.code==='EADDRINUSE'?'Адрес уже занят. Закрой другие экземпляры Луми и попробуй ещё раз.':error.message);app.quit();});
}
