// Arithmetic only. Never executes user input as JavaScript.
export function arithmetic(input) {
  const source = String(input).replaceAll(',', '.').replace(/[×·х]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-').replace(/\s/g, '');
  if (!source || source.length > 160 || /[^\d.+\-*/()^]/.test(source)) throw new Error('Нужны только числа и арифметические действия.');
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/^]/g) || [];
  if (tokens.join('') !== source) throw new Error('Не удалось прочитать выражение.');
  let cursor = 0, depth = 0;
  function atom() {
    if (++depth > 24) throw new Error('Слишком много скобок.');
    let value;
    const token = tokens[cursor++];
    if (token === '(') { value = sum(); if (tokens[cursor++] !== ')') throw new Error('Проверь скобки.'); }
    else if (token && /^\d/.test(token)) value = Number(token);
    else throw new Error('Не хватает числа.');
    depth--; return value;
  }
  function unary() { if (['+','-'].includes(tokens[cursor])) { const sign=tokens[cursor++]; return (sign==='-'?-1:1)*unary(); } return power(); }
  function power() { let value = atom(); if (tokens[cursor] === '^') { cursor++; const exp = unary(); if (Math.abs(exp) > 12) throw new Error('Слишком большая степень.'); value **= exp; } return value; }
  function product() { let value = unary(); while (['*','/'].includes(tokens[cursor])) { const op=tokens[cursor++], rhs=unary(); if (op==='/' && rhs===0) throw new Error('На ноль делить нельзя.'); value = op==='*' ? value*rhs : value/rhs; } return value; }
  function sum() { let value=product(); while (['+','-'].includes(tokens[cursor])) { const op=tokens[cursor++],rhs=product(); value=op==='+' ? value+rhs : value-rhs; } return value; }
  const value=sum();
  if (cursor!==tokens.length || !Number.isFinite(value) || Math.abs(value)>1e15) throw new Error('Проверь запись выражения.');
  return value;
}

export function checkWrittenSteps(text) {
  const lines=String(text).split(/\r?\n/).slice(0,30).map((v,i)=>({text:v.trim(),number:i+1})).filter(v=>v.text);
  const checks=[];
  for (const item of lines) {
    const line=item.text;
    if (!line.includes('=')) continue;
    const sides=line.split('=').map(v=>v.trim());
    try {
      const values=sides.map(arithmetic);
      const correct=values.slice(1).every((v,i)=>Number.isInteger(values[i])&&Number.isInteger(v)?values[i]===v:Math.abs(values[i]-v)<=1e-9);
      const mismatch=values.findIndex((v,i)=>i>0&&Math.abs(values[i-1]-v)>1e-9);
      const hint=/[÷:]/.test(line)?'Проверь деление обратным умножением.':/[()*×]/.test(line)?'Сначала скобки, затем умножение и деление, потом сложение и вычитание.':'Пересчитай по разрядам и проверь обратным действием.';
      checks.push({line,lineNumber:item.number,correct,mismatchPart:correct?null:Math.max(1,mismatch),message:correct?'Строка '+item.number+': арифметическое равенство верно.':'Строка '+item.number+': значения по сторонам '+(mismatch>1?mismatch+'-го знака =':'знака =')+' различаются. '+hint});
    } catch(error) { checks.push({line,lineNumber:item.number,correct:null,message:'Строка '+item.number+': '+error.message}); }
  }
  return {checks,scope:'Проверены только записанные числовые равенства. Соответствие условию, ход рассуждений и оформление требуют отдельной проверки.',status:checks.some(c=>c.correct===false)?'needs_correction':checks.length&&checks.every(c=>c.correct===true)?'arithmetic_checked':'needs_review'};
}

export function normalize(value) { return String(value??'').trim().toLocaleLowerCase('ru').replaceAll('ё','е').replace(/\s+/g,' ').replace(/[.!?]+$/,''); }
export function gradeAnswer(exercise,answer) {
  if (exercise.type==='number') {
    try { return Math.abs(arithmetic(answer)-arithmetic(exercise.answer)) <= (exercise.tolerance ?? 1e-8); } catch { return false; }
  }
  return [exercise.answer,...(exercise.accepted||[])].some(expected=>normalize(expected)===normalize(answer));
}
