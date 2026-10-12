import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createWorld(ctx){
 const {db,save,readJson,auth,body,json,fail,clean,now,id,DATA,escapeHtml,checkWrittenSteps,validatedPhoto,curriculum}=ctx;
 if((db.version||1)<2){
  const source=path.join(DATA,'family.json'),backup=path.join(DATA,'family.before-v2.json');
  if(fs.existsSync(source)&&!fs.existsSync(backup))fs.copyFileSync(source,backup,fs.constants.COPYFILE_EXCL);
  db.version=2;
 }
 db.petals??=[];db.giftRequests??=[];db.courseProgress??=[];db.certificates??=[];db.importedBooks??=[];db.testRuns??=[];db.storyProgress??=[];
 db.gifts??=[{id:'stickers',title:'Наклейки на выбор',description:'Выберем набор вместе с родителем.',cost:40,budget:150,icon:'sticker',active:true},{id:'little-toy',title:'Маленькая игрушка',description:'Приятная мелочь для твоих открытий.',cost:80,budget:300,icon:'gift',active:true},{id:'creative',title:'Для творчества',description:'Карандаши, бумага или другая маленькая радость.',cost:60,budget:250,icon:'palette',active:true}];
 const courses=()=>readJson('content/courses.json',{courses:[]}).courses;
 const articles=()=>readJson('content/parent-articles.json',{articles:[]}).articles;
 const stories=()=>readJson('content/stories.json',{stories:[]}).stories;
 function storyFor(s,storyId){const story=stories().find(c=>c.id===storyId);if(!story)fail(404,'История не найдена.');if(s.role==='child'&&!levelFits(story,db.profiles.find(p=>p.id===s.profileId)))fail(403,'Выбери историю своего уровня.');return story;}
 function storyProgress(s,story,create=false){let p=db.storyProgress.find(p=>p.profileId===s.profileId&&p.storyId===story.id);if(!p&&create){p={profileId:s.profileId,storyId:story.id,index:0,completed:false,attempts:0};db.storyProgress.push(p);}return p;}
 function storySummary(c,s){const p=storyProgress(s,c);return {id:c.id,title:c.title,summary:c.summary,coverCharacter:c.coverCharacter,levels:c.levels,started:!!p,complete:!!p?.completed,total:c.scenes.length};}
 function safeScene(scene){if(!scene)return null;const {question,...rest}=scene;return {...rest,...(question?{question:{prompt:question.prompt,options:question.options}}:{})};}
 function storySnapshot(c,s){const p=storyProgress(s,c),index=p?.index||0;return {...storySummary(c,s),index,sceneLabel:c.sceneLabel,scene:safeScene(c.scenes[index])};}
 const balance=profileId=>db.petals.filter(r=>r.profileId===profileId).reduce((n,r)=>n+r.amount,0);
 const levelFits=(c,p)=>!p||(!c.levels?.length||c.levels.includes(p.level))&&(!p.age||(!c.minAge||p.age>=c.minAge)&&(!c.maxAge||p.age<=c.maxAge));
 const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function award(profileId,key,amount,reason){
  if(db.petals.some(r=>r.profileId===profileId&&r.key===key))return 0;
  const day=dayKey(),earned=db.petals.filter(r=>r.profileId===profileId&&r.day===day&&r.kind==='earn').reduce((n,r)=>n+r.amount,0);
  const granted=Math.max(0,Math.min(amount,40-earned));
  db.petals.push({id:id(),profileId,key,amount:granted,requested:amount,reason,kind:'earn',at:now(),day});
  return granted;
 }
 function entry(profileId,key,amount,reason,kind){db.petals.push({id:id(),profileId,key,amount,reason,kind,at:now(),day:dayKey()});}
 const wallet=profileId=>({balance:balance(profileId),ledger:db.petals.filter(r=>r.profileId===profileId).slice(-30).reverse(),requests:db.giftRequests.filter(r=>r.profileId===profileId).slice().reverse(),gifts:db.gifts.filter(g=>g.active),dailyLimit:40});
 function testSummary(t){const answered=t.answers.length,correct=t.answers.filter(a=>a.correct).length,complete=answered===t.exerciseIds.length,percent=Math.round(correct/t.exerciseIds.length*100);return {id:t.id,profileId:t.profileId,lessonId:t.lessonId,title:t.title,level:t.level,total:t.exerciseIds.length,answered,correct,complete,percent:complete?percent:null,grade:complete&&t.level>0?(percent>=90?5:percent>=70?4:percent>=50?3:2):null,at:t.at};}
 function testRun(s,runId,lessonId,exerciseId){const t=db.testRuns.find(t=>t.id===runId);if(!t)fail(404,'Попытка теста не найдена.');if(t.profileId!==s.profileId)fail(403,'Это попытка другого профиля.');if(t.lessonId!==lessonId||!t.exerciseIds.includes(exerciseId))fail(400,'Задание не относится к этой попытке.');return t;}
 function courseSummary(c,s){const passed=db.courseProgress.filter(p=>p.profileId===s.profileId&&p.courseId===c.id&&p.passed);return {id:c.id,title:c.title,summary:c.summary,levels:c.levels,minAge:c.minAge,maxAge:c.maxAge,minutes:c.minutes,moduleCount:c.modules.length,completed:passed.length,certificate:db.certificates.find(t=>t.profileId===s.profileId&&t.courseId===c.id)?.id,sourceLinks:s.role==='parent'?c.sourceLinks:undefined};}
 function courseFor(s,courseId){const c=courses().find(c=>c.id===courseId);if(!c)fail(404,'Курс не найден.');if(s.role==='child'&&!levelFits(c,db.profiles.find(p=>p.id===s.profileId)))fail(403,'Этот курс рассчитан на другой возраст. Выбери курс своего уровня.');return c;}
 const safeModule=m=>({...m,quiz:m.quiz.map(({answer,accepted,solution,...q})=>q)});
 function booksFor(s){const profile=s.role==='child'?db.profiles.find(p=>p.id===s.profileId):null;return [...readJson('content/russian-books.json',{books:[]}).books,...db.importedBooks.map(b=>({...b,pdfUrl:'/api/books/'+b.id+'/file'}))].filter(b=>s.role==='parent'||b.childSafe===true&&(!b.levels?.length||b.levels.includes(profile.level))).map(({file,...b})=>b);}
 function safePdf(value,max=25*1024*1024){const m=String(value||'').match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);if(!m)fail(400,'Выбери файл PDF.');const buf=Buffer.from(m[1],'base64');if(buf.length>max)fail(413,'PDF должен быть не больше '+Math.round(max/1024/1024)+' МБ.');if(buf.subarray(0,5).toString()!=='%PDF-')fail(400,'Файл не похож на PDF.');return buf;}
 function validAttachment(value){if(!value)return null;const data=safePdf(value.data,5*1024*1024);return {name:clean(value.name,100)||'Черновик.pdf',mime:'application/pdf',data:data.toString('base64')};}
 function safeHomework(h){const {photo,attachment,history,...rest}=h;return {...rest,hasPhoto:!!photo,hasAttachment:!!attachment,attachmentName:attachment?.name,revision:history?.length||0};}
 function homework(s,itemId){const h=db.homework.find(h=>h.id===itemId);if(!h)fail(404,'Работа не найдена.');if(s.role!=='parent'&&h.profileId!==s.profileId)fail(403,'Это работа другого профиля.');return h;}
 function pdfResponse(res,buf){res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'private, no-store'});res.end(buf);}
 function certificateHtml(cert){const p=db.profiles.find(p=>p.id===cert.profileId),c=courses().find(c=>c.id===cert.courseId);return '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Грамота Луми</title><link rel="stylesheet" href="/certificate.css"><main><div class="stars">✦ · ✧ · ✦</div><p class="eyebrow">МАСТЕРСКАЯ ОТКРЫТИЙ ЛУМИ</p><h1>Грамота исследователя</h1><p>За любознательность и завершение курса</p><h2>'+escapeHtml(c?.title||cert.title)+'</h2><div class="name">'+escapeHtml(p?.name||'Исследователь')+'</div><p>Все встроенные проверки курса пройдены.</p><img src="/assets/lumi-reading.png" alt="Луми с книгой"><footer>'+new Date(cert.at).toLocaleDateString('ru-RU')+' · № '+escapeHtml(cert.id.slice(0,8))+'<br>Семейная грамота Луми. Не является документом об образовании.<br>Сохранить в PDF: Ctrl+P → «Сохранить как PDF».</footer></main></html>';}
 async function handle(req,res,url){
  const route=url.pathname,method=req.method;
  if(route==='/api/stories'&&method==='GET'){const s=auth(req),p=s.role==='child'?db.profiles.find(p=>p.id===s.profileId):null;json(res,200,{stories:stories().filter(c=>levelFits(c,p)).map(c=>storySummary(c,s))});return true;}
  const storyMatch=route.match(/^\/api\/stories\/([^/]+)(?:\/(choice|restart))?$/);
  if(storyMatch){
   const s=auth(req),story=storyFor(s,storyMatch[1]);
   if(method==='GET'&&!storyMatch[2]){json(res,200,storySnapshot(story,s));return true;}
   if(method==='POST'&&storyMatch[2]==='restart'){auth(req,'child');await body(req);const p=storyProgress(s,story,true);p.index=0;p.at=now();save();json(res,200,storySnapshot(story,s));return true;}
   if(method==='POST'&&storyMatch[2]==='choice'){
    auth(req,'child');const input=await body(req),p=storyProgress(s,story),index=p?.index||0,scene=story.scenes[index];
    if(!scene||input.sceneId!==scene.id)fail(409,'Сцена уже изменилась. Открой историю снова.');
    if(scene.question&&(!Number.isInteger(input.choice)||input.choice<0||input.choice>=scene.question.options.length))fail(400,'Выбери один из ответов.');
    const progress=storyProgress(s,story,true);progress.attempts++;progress.at=now();
    const accepted=!scene.question||input.choice===scene.question.answer;
    if(!accepted){save();json(res,200,{accepted:false,feedback:scene.question.feedbackWrong,story:storySnapshot(story,s)});return true;}
    progress.index++;const complete=progress.index===story.scenes.length;let petals=0;
    if(complete){progress.completed=true;petals=award(s.profileId,'story:'+story.id,Math.min(10,Math.max(0,story.reward||6)),'Завершена история: '+story.title);}
    save();json(res,200,{accepted:true,feedback:scene.question?.feedbackCorrect||'Продолжим.',petals,balance:balance(s.profileId),story:storySnapshot(story,s)});return true;
   }
  }
  if(route==='/api/world'&&method==='GET'){
   const s=auth(req),p=s.role==='child'?db.profiles.find(p=>p.id===s.profileId):null;
   json(res,200,{wallet:s.role==='child'?wallet(s.profileId):null,courses:courses().filter(c=>levelFits(c,p)).map(c=>courseSummary(c,s)),books:booksFor(s),articles:s.role==='parent'?articles().map(({sections,activity,sources,...a})=>a):[],curriculumMap:readJson('content/program-map.json',{}),certificates:db.certificates.filter(c=>s.role==='parent'||c.profileId===s.profileId),tests:db.testRuns.filter(t=>s.role==='parent'||t.profileId===s.profileId).slice(-30).reverse().map(testSummary)});return true;
  }
  if(route==='/api/parent/articles'&&method==='GET'){auth(req,'parent');const a=articles().find(a=>a.id===url.searchParams.get('id'));if(!a)fail(404,'Статья не найдена.');json(res,200,a);return true;}
  if(route==='/api/parent/course-answers'&&method==='GET'){const s=auth(req,'parent');json(res,200,courseFor(s,url.searchParams.get('course')));return true;}
  if(route==='/api/wallet'&&method==='GET'){const s=auth(req,'child');json(res,200,wallet(s.profileId));return true;}
  if(route==='/api/tests/start'&&method==='POST'){const s=auth(req,'child'),x=await body(req),lesson=curriculum().lessons.find(l=>l.id===x.lessonId);if(!lesson)fail(404,'Тест не найден.');const t={id:id(),profileId:s.profileId,lessonId:lesson.id,title:lesson.title,level:lesson.level,exerciseIds:lesson.exercises.map(e=>e.id),answers:[],at:now()};db.testRuns.push(t);save();json(res,201,testSummary(t));return true;}
  if(route==='/api/gifts/request'&&method==='POST'){
   const s=auth(req,'child'),input=await body(req),gift=db.gifts.find(g=>g.id===input.giftId&&g.active);if(!gift)fail(404,'Подарок пока недоступен.');
   if(db.giftRequests.some(r=>r.profileId===s.profileId&&r.gift.id===gift.id&&['pending','approved'].includes(r.status)))fail(409,'Этот подарок уже ждёт решения родителя.');
   if(balance(s.profileId)<gift.cost)fail(409,'Для этого подарка пока не хватает лепесточков.');
   const request={id:id(),profileId:s.profileId,gift:{...gift},status:'pending',createdAt:now()};
   db.giftRequests.push(request);entry(s.profileId,'reserve:'+request.id,-gift.cost,'Отложено на подарок: '+gift.title,'reserve');save();json(res,201,{request,wallet:wallet(s.profileId)});return true;
  }
  if(route==='/api/parent/rewards'&&method==='GET'){auth(req,'parent');json(res,200,{gifts:db.gifts,requests:db.giftRequests.slice().reverse(),profiles:db.profiles.map(p=>({id:p.id,name:p.name,balance:balance(p.id)})),ledger:db.petals.slice(-100).reverse()});return true;}
  if(route==='/api/parent/gifts'&&method==='POST'){
   auth(req,'parent');const x=await body(req),cost=Number(x.cost),budget=Number(x.budget);if(!clean(x.title,70)||!Number.isInteger(cost)||cost<1||cost>10000||!Number.isInteger(budget)||budget<0||budget>300)fail(400,'Укажи название, цену в лепесточках и бюджет от 0 до 300 ₽.');
   const old=x.id?db.gifts.find(g=>g.id===x.id):null;if(x.id&&!old)fail(404,'Подарок не найден.');if(!old&&db.gifts.length>=30)fail(400,'В семейной витрине можно хранить до 30 подарков.');
   const gift={id:old?.id||id(),title:clean(x.title,70),description:clean(x.description,300),cost,budget,active:x.active!==false,icon:'gift'};
   if(old)db.gifts[db.gifts.indexOf(old)]=gift;else db.gifts.push(gift);save();json(res,200,gift);return true;
  }
  if(route==='/api/parent/gifts/review'&&method==='POST'){
   auth(req,'parent');const x=await body(req),r=db.giftRequests.find(r=>r.id===x.id);if(!r)fail(404,'Заявка не найдена.');
   if(r.status===x.status){json(res,200,r);return true;}
   const allowed={pending:['approved','rejected'],approved:['fulfilled','rejected']};if(!allowed[r.status]?.includes(x.status))fail(409,'Статус заявки уже изменился. Обнови страницу.');
   r.status=x.status;r.feedback=clean(x.feedback,300);r.updatedAt=now();
   if(r.status==='rejected')entry(r.profileId,'refund:'+r.id,r.gift.cost,'Возвращено за подарок: '+r.gift.title,'refund');
   save();json(res,200,r);return true;
  }
  const courseMatch=route.match(/^\/api\/courses\/([^/]+)(?:\/modules\/([^/]+)(?:\/(check))?)?$/);
  if(courseMatch){
   const s=auth(req),c=courseFor(s,courseMatch[1]);
   if(method==='GET'&&!courseMatch[2]){json(res,200,{...courseSummary(c,s),modules:c.modules.map(m=>({id:m.id,title:m.title,passed:db.courseProgress.some(p=>p.profileId===s.profileId&&p.courseId===c.id&&p.moduleId===m.id&&p.passed)}))});return true;}
   const m=c.modules.find(m=>m.id===courseMatch[2]);if(!m)fail(404,'Занятие не найдено.');
   if(method==='GET'){json(res,200,safeModule(m));return true;}
   if(method==='POST'&&courseMatch[3]){
    auth(req,'child');const x=await body(req);if(!Array.isArray(x.answers)||x.answers.length!==m.quiz.length)fail(400,'Ответь на каждый вопрос.');
    if(!x.answers.every((a,i)=>/^\d+$/.test(String(a))&&Number(a)<m.quiz[i].options.length))fail(400,'Выбери ответы из предложенных вариантов.');
    const results=m.quiz.map((q,i)=>({id:q.id,correct:String(q.answer)===String(x.answers[i]),hint:q.hint||q.hints?.[0]||'Перечитай объяснение и попробуй ещё раз.'}));
    const correct=results.filter(r=>r.correct).length,passed=correct===m.quiz.length;let progress=db.courseProgress.find(p=>p.profileId===s.profileId&&p.courseId===c.id&&p.moduleId===m.id);
    if(!progress){progress={profileId:s.profileId,courseId:c.id,moduleId:m.id,passed:false,attempts:0};db.courseProgress.push(progress);}progress.attempts++;progress.lastCorrect=correct;progress.at=now();progress.passed||=passed;
    let petals=passed?award(s.profileId,'course:'+c.id+':'+m.id,5,'Освоено занятие: '+m.title):0;
    const complete=c.modules.every(m=>db.courseProgress.some(p=>p.profileId===s.profileId&&p.courseId===c.id&&p.moduleId===m.id&&p.passed));
    let certificate=db.certificates.find(t=>t.profileId===s.profileId&&t.courseId===c.id);
    if(complete&&!certificate){certificate={id:id(),profileId:s.profileId,courseId:c.id,title:c.title,at:now()};db.certificates.push(certificate);petals+=award(s.profileId,'certificate:'+c.id,10,'Завершён курс: '+c.title);}
    save();json(res,200,{passed,correct,total:m.quiz.length,results,petals,certificate:certificate?.id});return true;
   }
  }
  if(route.startsWith('/certificate/')&&method==='GET'){
   const s=auth(req),cert=db.certificates.find(c=>c.id===route.slice(13));if(!cert)fail(404,'Грамота ещё не выдана.');if(s.role!=='parent'&&cert.profileId!==s.profileId)fail(403,'Это грамота другого профиля.');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'});res.end(certificateHtml(cert));return true;
  }
  if(route==='/api/parent/books'&&method==='POST'){
   auth(req,'parent');const x=await body(req,36*1024*1024),pdf=safePdf(x.data);if(!clean(x.title,120))fail(400,'Укажи название книги.');
   const bookId='family-'+crypto.randomUUID(),dir=path.join(DATA,'books');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,bookId+'.pdf'),pdf,{flag:'wx',mode:0o600});
   const book={id:bookId,title:clean(x.title,120),author:clean(x.author,120),language:clean(x.language,20)||'ru',levels:Array.isArray(x.levels)?x.levels.filter(n=>Number.isInteger(n)&&n>=0&&n<=11):[],file:bookId+'.pdf',childSafe:x.childSafe===true,imported:true,createdAt:now(),license:'Семейный файл. Доступ ребёнку настраивает родитель.'};db.importedBooks.push(book);save();json(res,201,{id:book.id});return true;
  }
  const bookMatch=route.match(/^\/api\/books\/([^/]+)\/file$/);
  if(bookMatch&&method==='GET'){
   const s=auth(req),b=db.importedBooks.find(b=>b.id===bookMatch[1]);if(!b)fail(404,'Книга не найдена.');if(s.role!=='parent'&&!b.childSafe)fail(403,'Книга доступна только родителю.');pdfResponse(res,fs.readFileSync(path.join(DATA,'books',b.file)));return true;
  }
  if(route==='/api/parent/books/access'&&method==='POST'){auth(req,'parent');const x=await body(req),b=db.importedBooks.find(b=>b.id===x.id);if(!b)fail(404,'Книга не найдена.');b.childSafe=x.childSafe===true;save();json(res,200,{ok:true});return true;}
  const attachmentMatch=route.match(/^\/api\/homework\/([^/]+)\/attachment$/);
  if(attachmentMatch&&method==='GET'){const h=homework(auth(req),attachmentMatch[1]);if(!h.attachment)fail(404,'Файл отсутствует.');pdfResponse(res,Buffer.from(h.attachment.data,'base64'));return true;}
  const reviseMatch=route.match(/^\/api\/homework\/([^/]+)\/revise$/);
  if(reviseMatch&&method==='POST'){
   const s=auth(req,'child'),h=homework(s,reviseMatch[1]),x=await body(req),task=clean(x.task,5000),steps=clean(x.steps,6000);if(!task)fail(400,'Добавь условие.');
   const photo=x.photo?validatedPhoto(x.photo):h.photo,attachment=x.attachment?validAttachment(x.attachment):h.attachment;
   h.history??=[];h.history.push({steps:h.steps,review:h.review,result:h.result,at:h.updatedAt||h.createdAt});if(h.history.length>10)h.history.shift();
   Object.assign(h,{task,steps,bookReference:clean(x.bookReference,200)||h.bookReference,subject:clean(x.subject,40)||h.subject,photo,attachment,result:checkWrittenSteps(steps),review:null,updatedAt:now()});h.status=h.result.status;save();json(res,200,safeHomework(h));return true;
  }
  return false;
 }
 return {handle,award,balance,validAttachment,safeHomework,testRun,testSummary};
}
