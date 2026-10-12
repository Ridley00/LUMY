/* Accessible, theme-aware dropdowns for profile preferences. */
let selectNumber=0;
function enhanceProfileSelects(){
 for(const native of document.querySelectorAll('select[name=style]:not([data-soft-select]),select[name=explanation]:not([data-soft-select])')){
  native.dataset.softSelect='true';native.tabIndex=-1;native.setAttribute('aria-hidden','true');
  const box=document.createElement('span');box.className='soft-select';native.before(box);box.append(native);
  const listId='soft-options-'+(++selectNumber),label=native.closest('label')?.childNodes[0]?.textContent?.trim()||'Выбери вариант';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',listId);
  const list=document.createElement('span');list.id=listId;list.className='select-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',label);list.hidden=true;box.append(trigger,list);
  let focused=native.selectedIndex;
  function sync(){trigger.innerHTML='<span>'+escape(native.options[native.selectedIndex]?.textContent||'')+'</span>'+icon('next');list.replaceChildren();[...native.options].forEach((option,index)=>{const button=document.createElement('button');button.type='button';button.role='option';button.id=listId+'-'+index;button.tabIndex=-1;button.dataset.index=index;button.setAttribute('aria-selected',String(index===native.selectedIndex));button.textContent=option.textContent;button.disabled=option.disabled;list.append(button);});}
  function close(){list.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');box.classList.remove('open','open-up');}
  function focusItem(index){focused=Math.max(0,Math.min(native.options.length-1,index));list.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('focused',i===focused));trigger.setAttribute('aria-activedescendant',listId+'-'+focused);}
  function open(){document.querySelectorAll('.soft-select.open .select-trigger').forEach(b=>{if(b!==trigger)b.click();});list.hidden=false;box.classList.add('open');trigger.setAttribute('aria-expanded','true');focused=native.selectedIndex;focusItem(focused);box.classList.toggle('open-up',trigger.getBoundingClientRect().bottom+list.offsetHeight>innerHeight-12);}
  function choose(index){native.selectedIndex=index;native.dispatchEvent(new Event('change',{bubbles:true}));close();trigger.focus();}
  trigger.addEventListener('click',event=>{event.preventDefault();list.hidden?open():close();});
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)){
   event.preventDefault();if(event.key==='Escape')return close();
   if(event.key==='Enter'||event.key===' '){if(list.hidden)open();else choose(focused);return;}
   const wasClosed=list.hidden;if(wasClosed)open();if(!wasClosed||event.key==='Home'||event.key==='End')focusItem(event.key==='Home'?0:event.key==='End'?native.options.length-1:focused+(event.key==='ArrowUp'?-1:1));
  }else if(event.key==='Tab')close();});
  list.addEventListener('click',event=>{const b=event.target.closest('[data-index]');if(b)choose(Number(b.dataset.index));});
  box.addEventListener('focusout',event=>{if(!box.contains(event.relatedTarget))close();});native.addEventListener('change',sync);sync();
 }
}
const controlRender=render,controlModal=modal,controlSetup=renderSetup;
render=function(){controlRender();enhanceProfileSelects();};
modal=function(content){controlModal(content);document.querySelector('.modal')?.classList.toggle('calm',profile()?.style==='calm');enhanceProfileSelects();};
renderSetup=function(){controlSetup();enhanceProfileSelects();};
document.addEventListener('pointerdown',event=>{document.querySelectorAll('.soft-select.open').forEach(box=>{if(!box.contains(event.target))box.querySelector('.select-trigger').click();});});
init();
