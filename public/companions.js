/* Character reactions and story scenes. Learning results and rewards stay on the server. */
const friends={
 lumi:{name:'Луми',role:'Разбирается по шагам',intro:'Я Луми. Помогу найти следующий шаг, даже если пока непонятно, с чего начать.',idea:'Попробуй объяснить одно действие своими словами. Если запнулся, это хорошее место для вопроса.',mistakes:'Ошибка помогает найти шаг, который стоит проверить. Можно спокойно попробовать ещё раз.'},
 tish:{name:'Тиш',role:'Задаёт вопросы',intro:'Я Тиш! Иногда спешу и путаюсь. Люблю, когда мы вместе замечаем, что не сходится.',idea:'Сначала посмотри на условие, потом на мой ответ. Есть ли способ проверить его другим действием?',mistakes:'У меня тоже бывает неверный ответ. Давай проверим один шаг, а не всю работу сразу.'},
 mira:{name:'Мира',role:'Придумывает и рисует',intro:'Я Мира. Люблю книги, рисунки и задачи, которые можно увидеть по-новому.',idea:'Нарисуй условие: предметы, стрелки или маленькую схему. Иногда рисунок помогает понять слова.',mistakes:'Первый набросок можно изменить. С решением так же: ищем, что улучшить, и пробуем снова.'}
};
const companions={moment:null,timers:new Set(),completed:new Set(),story:null,nextStory:null,feedback:null,busy:false,typingTimer:null};
const previousCharacter=character,previousDialogue=dialogue,previousRender=render,previousApi=api,previousClear=clearPrivateState,previousLogin=renderLogin;
character=function(name='lumi',mood='idle'){
 const key=name==='tish'?'tish':name==='mira'?'mira':'lumi';
 const file=key==='tish'?'tish.png':key==='mira'?'mira.png':mood==='celebrate'?'lumi-celebrate.png':mood==='thinking'?'lumi-thinking.png':name==='reading'?'lumi-reading.png':name==='petals'?'lumi-petals.png':'lumi.webp';
 const safeMood=['idle','wave','thinking','celebrate','reading','curious'].includes(mood)?mood:'idle';
 return '<img class="character pose-'+safeMood+'" data-character="'+key+'" src="/assets/'+file+'" alt="'+friends[key].name+'" width="220" height="245" decoding="async">';
};
dialogue=function(speaker,text,mood='idle'){const key=speaker==='Тиш'?'tish':speaker==='Мира'?'mira':'lumi';return '<div class="story-dialogue">'+character(key==='lumi'?'reading':key,mood)+'<div><span class="dialogue-name">'+escape(speaker)+'</span><p>'+escape(text)+'</p></div></div>';};
function motionAllowed(){return document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&profile()?.style!=='calm'&&document.visibilityState!=='hidden';}
function later(callback,delay){const timer=setTimeout(()=>{companions.timers.delete(timer);callback();},delay);companions.timers.add(timer);return timer;}
function clearEffects(){for(const t of companions.timers)clearTimeout(t);companions.timers.clear();document.querySelectorAll('.lumi-effects').forEach(e=>e.remove());}
function petalsInAir(kind='petal'){
 if(role()!=='child'||!motionAllowed())return;
 const layer=document.createElement('div');layer.className='lumi-effects';layer.setAttribute('aria-hidden','true');
 const anchor=document.querySelector('.wallet-chip')||document.querySelector('.story-stage')||document.querySelector('.hero-art');
 const box=anchor?.getBoundingClientRect(),x=Math.min(innerWidth-35,Math.max(35,box?box.left+box.width/2:innerWidth/2)),y=Math.max(60,Math.min(innerHeight-80,box?box.top+box.height/2:innerHeight/3));
 for(let i=0;i<(kind==='petal'?14:9);i++){
  const leaf=document.createElement('i');leaf.className=kind==='petal'?'flying-petal':'flying-spark';
  leaf.style.setProperty('--x',x+'px');leaf.style.setProperty('--y',y+'px');leaf.style.setProperty('--dx',((i%2?1:-1)*(35+(i*31)%150))+'px');leaf.style.setProperty('--dy',(-45-(i*23)%160)+'px');leaf.style.setProperty('--spin',(i*43-170)+'deg');leaf.style.setProperty('--wait',(i*28)+'ms');layer.append(leaf);
 }
 document.body.append(layer);later(()=>layer.remove(),1900);
}
function contextGuide(){
 const moment=companions.moment;if(moment?.profileId===profile()?.id&&moment.view===state.view)return moment;
 const defaults={
  lesson:['lumi','thinking','Сначала условие, потом один шаг. Подсказка в задании поможет начать.'],
  tests:['tish','curious','Тут попробуем сами. После ответа разберём, что получилось.'],
  homework:['tish','thinking','Покажи свои действия. Проверяем место, где ответ начал расходиться.'],
  resources:['mira','reading','Выберем историю? После чтения расскажи, что тебя удивило.'],
  courses:['mira','curious','В мастерской можно пробовать, проверять и придумывать.'],
  course:['mira','reading','Один маленький опыт помогает понять больше, чем просто запомнить правило.'],
  gifts:['lumi','celebrate','Лепесточки растут за попытки и исправления. Подарок выбираем вместе с родителем.'],
  tutor:['lumi','thinking','Можно попросить похожий пример или объяснение одного шага.']
 };
 const [friend,mood,text]=defaults[state.view]||['lumi','idle','Выберем маленькое открытие на сегодня.'];return{friend,mood,text};
}
function guidePanel(g=contextGuide()){return '<aside class="friend-guide" aria-label="Поддержка персонажа">'+character(g.friend,g.mood)+'<div><span class="dialogue-name">'+friends[g.friend].name+'</span><p data-guide-message>'+escape(g.text)+'</p></div><button class="small ghost" data-action="friend-hello" data-friend="'+g.friend+'">Поговорить '+icon('next')+'</button></aside>';}
function friendRail(){return '<section class="friends-section"><div class="section-head full-head"><div><span class="eyebrow">ТВОЯ КОМАНДА ОТКРЫТИЙ</span><h2>Познакомимся поближе?</h2></div><button class="small" data-action="stories">Истории и игры '+icon('next')+'</button></div><div class="friends-rail">'+Object.entries(friends).map(([key,f])=>'<button class="friend-card" data-action="friend-hello" data-friend="'+key+'">'+character(key,key==='lumi'?'wave':key==='tish'?'curious':'reading')+'<span><strong>'+f.name+'</strong><small>'+f.role+'</small></span>'+icon('next')+'</button>').join('')+'</div></section>';}
function decoratePage(){
 if(role()!=='child')return;
 const main=document.querySelector('#main-content');if(!main)return;
 if(state.view==='home'){
  main.insertAdjacentHTML('beforeend',friendRail());
  const art=main.querySelector('.hero-art');if(art){art.insertAdjacentHTML('beforeend','<div class="forest-lights" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><button class="hero-hello" data-action="friend-hello" data-friend="lumi" aria-label="Поздороваться с Луми">'+icon('star')+'</button>');}
 }else if(['lesson','tests','homework','resources','courses','course','gifts','tutor'].includes(state.view)){
  const heading=main.querySelector('.section-head');if(heading)heading.insertAdjacentHTML('afterend',guidePanel());else main.insertAdjacentHTML('afterbegin',guidePanel());
 }
 if(state.view==='tests'&&state.test&&state.test.index>=state.test.lesson.exercises.length){
  const key=state.test.runId;if(!companions.completed.has(key)){companions.completed.add(key);later(()=>petalsInAir('spark'),100);}
  const guide=main.querySelector('.friend-guide');if(guide)guide.outerHTML=guidePanel({friend:'lumi',mood:'celebrate',text:'Попытка завершена. Посмотрим, какой шаг уже получается, а какой стоит разобрать ещё раз.'});
 }
}
render=function(){previousRender();decoratePage();};
renderLogin=function(){clearEffects();previousLogin();document.querySelector('.login-hero .character')?.classList.add('pose-wave');};
clearPrivateState=function(){clearEffects();stopTyping();companions.moment=null;companions.story=null;companions.nextStory=null;companions.busy=false;companions.feedback=null;companions.completed.clear();previousClear();};
function setReaction(friend,mood,text){companions.moment={friend,mood,text,view:state.view,profileId:profile()?.id};const guide=document.querySelector('.friend-guide');if(guide)guide.outerHTML=guidePanel(companions.moment);}
api=async function(url,options){
 const result=await previousApi(url,options);if(role()!=='child')return result;
 const owner=profile()?.id;
 if(/\/api\/exercises\/[^/]+\/check$/.test(url)){
  setReaction('lumi',result.correct?'celebrate':'thinking',result.correct?'Получилось! Попробуй рассказать, как ты нашёл ответ.':'Здесь есть шаг, который стоит проверить. Прочитай подсказку рядом с ответом.');
  requestAnimationFrame(()=>{
   if(profile()?.id!==owner)return;
   const feedback=options?.body?.mode==='test'?document.querySelector('#test-feedback'):document.querySelector('#exercise-'+CSS.escape(decodeURIComponent(url.split('/')[3]))+' .exercise-feedback');
   if(feedback&&!feedback.querySelector('.reaction-portrait'))feedback.insertAdjacentHTML('afterbegin','<span class="reaction-portrait">'+character('lumi',result.correct?'celebrate':'thinking')+'</span>');
   if(result.correct)petalsInAir(result.petals?'petal':'spark');
  });
 }else if(/\/hint$/.test(url)){setReaction('lumi','thinking','Подсказка готова. Возьми из неё один шаг и попробуй продолжить сам.');}
 else if(/\/api\/courses\/.*\/check$/.test(url)){setReaction('mira',result.passed?'celebrate':'thinking',result.passed?'Мастерская рада твоему открытию! Можно перейти к следующему занятию.':'Давай вернёмся к примеру и посмотрим на него другим способом.');if(result.passed)later(()=>petalsInAir('petal'),100);}
 else if((url==='/api/homework'||/\/api\/homework\/.*\/revise$/.test(url))&&options?.method==='POST'){
  setReaction('tish',result.status==='arithmetic_checked'?'celebrate':'thinking',result.status==='arithmetic_checked'?'Вычисления сошлись. Всю работу ещё может посмотреть родитель.':'Черновик сохранён. Найдём место, которое стоит поправить.');
 }
 return result;
};
function showFriend(key){
 const f=friends[key];if(!f||role()!=='child')return;
 modal('<section class="friend-conversation"><div class="friend-portrait">'+character(key,key==='lumi'?'wave':'curious')+'</div><div class="friend-speech"><span class="eyebrow">ДРУЗЬЯ ЛУМИ</span><h2>'+f.name+'</h2><p id="friend-line" aria-live="polite">'+escape(f.intro)+'</p><div class="conversation-options"><button data-action="friend-talk" data-friend="'+key+'" data-topic="idea">Дай идею</button><button data-action="friend-talk" data-friend="'+key+'" data-topic="mistakes">А если ошибусь?</button><button class="primary" data-action="stories">Сыграем историю '+icon('next')+'</button></div></div></section>');document.querySelector('.modal').classList.add('friend-modal');
}
async function storyLibrary(){
 const {stories}=await api('/api/stories');
 modal('<h2>Истории маленького леса</h2><p class="muted">Говорим с героями, выбираем действия и помогаем друг другу.</p><div class="story-library">'+stories.map(s=>'<button class="story-card" data-action="story-open" data-id="'+escape(s.id)+'">'+character(s.coverCharacter,s.complete?'celebrate':'curious')+'<strong>'+escape(s.title)+'</strong><p>'+escape(s.summary)+'</p><small>'+(s.complete?'История пройдена · можно переиграть':s.started?'Продолжить историю':'Начать историю')+'</small></button>').join('')+'</div>');
}
function storyScene(){
 const story=companions.story,scene=story?.scene;if(!story)return;
 if(!scene){modal('<div class="story-ending">'+character('lumi','celebrate')+'<h2>'+escape(story.title)+'</h2><p>История завершена. Ты помог героям проверить свои идеи.</p><button class="primary" data-action="stories">Другие истории</button><button data-action="story-replay" data-id="'+escape(story.id)+'">Пройти ещё раз</button></div>');return;}
 const hero=friends[scene.speaker]||friends.lumi;
 modal('<section class="story-stage" data-story="'+escape(story.id)+'" data-scene="'+escape(scene.id)+'"><div class="story-topline"><span>'+escape(story.sceneLabel||'Маленький лес')+'</span><span>Сцена '+(story.index+1)+' из '+story.total+'</span></div><div class="story-landscape" aria-hidden="true"><i class="landscape-tree tree-one"></i><i class="landscape-tree tree-two"></i><i class="landscape-tree tree-three"></i><i class="landscape-hill"></i><i class="landscape-hill hill-two"></i><span class="story-fireflies"></span></div><div class="story-cast"><div class="cast-member '+(scene.speaker==='lumi'?'speaking':'')+'">'+character('lumi',scene.speaker==='lumi'?scene.mood:'idle')+'</div><div class="cast-member '+(scene.speaker!=='lumi'?'speaking':'')+'">'+character(scene.speaker==='lumi'?(story.coverCharacter==='lumi'?'tish':story.coverCharacter):scene.speaker,scene.mood)+'</div></div><div class="novel-dialogue"><span class="speaker-label">'+hero.name+'</span><p class="novel-line" id="novel-line">'+escape(scene.text)+'</p>'+(scene.question?'<h3>'+escape(scene.question.prompt)+'</h3><div class="novel-choices">'+scene.question.options.map((text,i)=>'<button data-action="story-choice" data-choice="'+i+'">'+escape(text)+'</button>').join('')+'</div>':'<button class="primary story-continue" data-action="story-choice">Продолжить '+icon('next')+'</button>')+'<p id="story-feedback" role="status" hidden></p></div></section>');
 document.querySelector('.modal').classList.add('novel-modal');
 typeLine(document.querySelector('#novel-line'),scene.text);
}
function stopTyping(){clearTimeout(companions.typingTimer);companions.typingTimer=null;}
function typeLine(node,text){stopTyping();if(!node||!motionAllowed())return;node.setAttribute('aria-label',text);node.textContent='';let index=0;const type=()=>{if(!node.isConnected)return;index=Math.min(text.length,index+2);node.textContent=text.slice(0,index);if(index<text.length)companions.typingTimer=setTimeout(type,24);else companions.typingTimer=null;};type();node.insertAdjacentHTML('afterend','<button class="ghost small skip-line" data-action="story-show-line">Показать всю реплику</button>');}
const companionClose=closeModal;closeModal=function(){stopTyping();companionClose();};
async function startStory(id,replay=false){const r=await api('/api/stories/'+encodeURIComponent(id)+(replay?'/restart':''),replay?{method:'POST',body:{}}:undefined);companions.story=r;storyScene();}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(!['friend-hello','friend-talk','stories','story-open','story-replay','story-show-line','story-advance','story-choice'].includes(action))return;
 try{
  if(action==='friend-hello')return showFriend(button.dataset.friend);
  if(action==='friend-talk'){const line=document.querySelector('#friend-line');if(line){line.textContent=friends[button.dataset.friend]?.[button.dataset.topic]||'';line.classList.remove('line-arrive');void line.offsetWidth;line.classList.add('line-arrive');}return;}
  if(action==='stories')return await storyLibrary();
  if(action==='story-open'||action==='story-replay')return await startStory(button.dataset.id,action==='story-replay');
  if(action==='story-show-line'){stopTyping();const line=document.querySelector('#novel-line');if(line)line.textContent=companions.story.scene.text;button.remove();return;}
  if(action==='story-advance'){companions.story=companions.nextStory;companions.nextStory=null;storyScene();return;}
  if(action==='story-choice'){
   if(companions.busy||!companions.story?.scene)return;companions.busy=true;
   const s=companions.story,sceneId=s.scene.id;
   const result=await api('/api/stories/'+s.id+'/choice',{method:'POST',body:{sceneId,choice:button.dataset.choice===undefined?undefined:Number(button.dataset.choice)}});
   const feedback=document.querySelector('#story-feedback');
   if(!result.accepted){if(feedback){feedback.hidden=false;feedback.textContent=result.feedback;}document.querySelectorAll('.story-cast .character').forEach(img=>img.classList.add('pose-thinking'));return;}
   if(feedback){feedback.hidden=false;feedback.textContent=result.feedback||'Идём дальше.';}
   document.querySelectorAll('.novel-choices button,.story-continue').forEach(b=>b.disabled=true);
   if(result.petals)petalsInAir('petal');
   if(s.scene.question){companions.nextStory=result.story;document.querySelector('.novel-dialogue').insertAdjacentHTML('beforeend','<button class="primary story-advance" data-action="story-advance">Продолжить '+icon('next')+'</button>');}
   else {companions.story=result.story;storyScene();}return;
  }
 }catch(error){toast(error.message);}finally{if(action==='story-choice')companions.busy=false;}
});

// Keep the previous sheet visible while the new image/text/PDF is prepared.
const previousBookPage=renderBookPage;
renderBookPage=async function(){
 const host=document.querySelector('#reader-page'),oldPage=Number(host?.dataset.rendered||0),next=world.page;
 if(!host||!oldPage||oldPage===next||!motionAllowed())return await previousBookPage();
 document.querySelectorAll('.page-before').forEach(p=>p.remove());
 const sheet=host.cloneNode(true);sheet.removeAttribute('id');sheet.dataset.rendered='';sheet.setAttribute('aria-hidden','true');sheet.inert=true;sheet.classList.remove('page-turn','sheet-in');sheet.classList.add('page-before');
 const oldCanvas=host.querySelector('canvas'),canvas=sheet.querySelector('canvas');if(oldCanvas&&canvas)canvas.getContext('2d').drawImage(oldCanvas,0,0);
 const rect=host.getBoundingClientRect(),stage=host.parentElement,stageRect=stage.getBoundingClientRect();sheet.style.left=(rect.left-stageRect.left+stage.scrollLeft)+'px';sheet.style.top=(rect.top-stageRect.top+stage.scrollTop)+'px';sheet.style.width=rect.width+'px';sheet.style.height=rect.height+'px';
 if(next<oldPage)sheet.classList.add('turn-back');sheet.style.animation='none';stage.append(sheet);
 try{await previousBookPage();if(!host.isConnected||world.page!==next){sheet.remove();return;}void sheet.offsetWidth;sheet.style.animation='';host.classList.toggle('turn-back',next<oldPage);host.classList.add('sheet-in');later(()=>{sheet.remove();host.classList.remove('sheet-in','turn-back');},680);}catch(error){sheet.remove();throw error;}
};
brand=function(){return '<div><a class="brand" href="/" aria-label="Луми, главная"><span class="brand-mark"><img src="/assets/lumi-mark.svg" alt="" width="44" height="44"></span>луми</a><div class="brand-sub">'+(state.boot?.demo?'Тестовый кабинет':'Маленькие шаги. Большие открытия.')+'</div></div>';};
