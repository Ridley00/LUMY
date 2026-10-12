import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=path.join(process.env.APPDATA,'Lumi/data');
const file=path.join(directory,'family.json'),queue=path.join(directory,'pending-child-codes.json');
if(fs.existsSync(queue))throw Error('Обновление кодов уже подготовлено. Не создаю второе.');
const db=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const names=['Богдан','Полина','Алена'],codes=[],resets=[],used=new Set();
for(const name of names){
 const profiles=db.profiles.filter(p=>p.name===name);if(profiles.length!==1)throw Error('Неоднозначный профиль: '+name);
 const p=profiles[0];let pin;
 do{pin=String(crypto.randomInt(0,1000000)).padStart(6,'0');}while(used.has(pin)||db.profiles.some(other=>{const [salt,key]=other.pinHash.split(':');return crypto.timingSafeEqual(crypto.scryptSync(pin,salt,64),Buffer.from(key,'hex'));}));
 used.add(pin);const salt=crypto.randomBytes(16).toString('hex'),pinHash=salt+':'+crypto.scryptSync(pin,salt,64).toString('hex');
 codes.push({name,code:pin,level:p.level});resets.push({id:p.id,name,pinHash});
}
fs.writeFileSync(queue,JSON.stringify({version:1,requestedAt:new Date().toISOString(),profiles:resets},null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({ok:true,activation:'При следующем запуске Луми 0.3.0',codes,plainCodesSavedToDisk:false}));
