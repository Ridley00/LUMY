import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arithmetic,checkWrittenSteps,gradeAnswer} from '../math-check.mjs';

test('school arithmetic respects grouping, powers and decimal commas',()=>{
  for(const [expression,value] of [['24:3×5',40],['(12+8)/4',5],['0,5+1,25',1.75],['-2^2',-4],['(-2)^2',4],['2^-2',.25],['2^3^2',512],['1/3+2/3',1]])assert.equal(arithmetic(expression),value,expression);
});
test('rejects unsafe or malformed input and undefined arithmetic',()=>{
  for(const value of ['process.exit()','1/0','2+','2(3)','1.2.3','2^1000','1e100','5=5'])assert.throws(()=>arithmetic(value),value);
});
test('written work never certifies semantic correctness',()=>{
  assert.equal(checkWrittenSteps('24:3=8\n8*5=40').status,'arithmetic_checked');
  assert.equal(checkWrittenSteps('24:3=9').status,'needs_correction');
  assert.equal(checkWrittenSteps('1000000000=1000000001').status,'needs_correction');
  assert.equal(checkWrittenSteps('0.1+0.2=0.3').status,'arithmetic_checked');
  assert.equal(checkWrittenSteps('24:3=8\nx+1=2').status,'needs_review');
  assert.equal(checkWrittenSteps('Мне кажется, ответ верный.').status,'needs_review');
  assert.match(checkWrittenSteps('1=1').scope,/требуют отдельной проверки/);
});
test('grading accepts equivalent numeric notation and explicit text variants',()=>{
  assert.equal(gradeAnswer({type:'number',answer:'0.5'},'1/2'),true);
  assert.equal(gradeAnswer({type:'number',answer:'3'},'3 метра'),false);
  assert.equal(gradeAnswer({type:'text',answer:'Ёлка',accepted:['Ель']},' ель. '),true);
  assert.equal(gradeAnswer({type:'choice',answer:'2'},'3'),false);
});
