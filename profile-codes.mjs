import fs from 'node:fs';
import path from 'node:path';

// Explicitly requested code rotations are applied at startup, before sessions exist.
export function applyPendingProfileCodes(dataDir){
 const queue=path.join(dataDir,'pending-child-codes.json'),file=path.join(dataDir,'family.json');
 if(!fs.existsSync(queue))return false;
 const request=JSON.parse(fs.readFileSync(queue,'utf8'));
 const family=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(request.version!==1||!Array.isArray(request.profiles)||request.profiles.length<1||request.profiles.length>12)throw Error('Неверный файл обновления кодов.');
 const ids=new Set();
 for(const reset of request.profiles){
  const p=family.profiles.find(p=>p.id===reset.id&&p.name===reset.name);
  if(!p||ids.has(reset.id)||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(reset.pinHash))throw Error('Профиль для обновления кода не совпадает.');
  ids.add(reset.id);
 }
 const backup=path.join(dataDir,'family.before-code-reset-'+Date.now()+'.json');
 fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
 for(const reset of request.profiles)family.profiles.find(p=>p.id===reset.id).pinHash=reset.pinHash;
 const temporary=file+'.code-reset';
 fs.writeFileSync(temporary,JSON.stringify(family,null,2),{mode:0o600});
 fs.renameSync(temporary,file);
 fs.unlinkSync(queue);
 return true;
}
