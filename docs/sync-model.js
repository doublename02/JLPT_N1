/* Mergeable personal records. Tokens never belong in this document. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KotonohaSyncModel=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const groups=['known','saved','notes','history','mistakes','custom'];
const copy=x=>JSON.parse(JSON.stringify(x));
const safeKey=k=>typeof k==='string'&&k.length>0&&k.length<300&&!['__proto__','prototype','constructor'].includes(k);
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const ordered=(a,b)=>Number(a?.clock||0)-Number(b?.clock||0)||String(a?.device||'').localeCompare(String(b?.device||''))||JSON.stringify(stable(a?.value)).localeCompare(JSON.stringify(stable(b?.value)));
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function empty(owner){return {schema:2,owner:String(owner),clock:0,groups:Object.fromEntries(groups.map(g=>[g,{}])),activity:{}};}
const isQuestion=q=>q&&safeKey(q.id)&&typeof q.category==='string'&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length>=3&&q.options.length<=4&&q.options.every(v=>typeof v==='string')&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length&&typeof q.explanation==='string'&&typeof q.zh==='string'&&(!q.passage||typeof q.passage==='string')&&(!q.script||typeof q.script==='string');
const isCard=c=>c&&['id','title','category','jp','zh','example','translation'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=12000);
function validate(doc,owner){
 if(!doc||doc.schema!==2||doc.owner!==String(owner)||!Number.isSafeInteger(doc.clock)||doc.clock<0||!doc.groups||!doc.activity)throw Error('保存データの形式またはアカウントが一致しません。');
 for(const g of groups){if(!doc.groups[g]||typeof doc.groups[g]!=='object'||Array.isArray(doc.groups[g]))throw Error('記録の形式が正しくありません。');for(const[k,r]of Object.entries(doc.groups[g])){if(!safeKey(k)||!r||!Number.isSafeInteger(r.clock)||r.clock<0||typeof r.device!=='string'||r.device.length>100||!Object.hasOwn(r,'value'))throw Error('記録の形式が正しくありません。');if(g==='notes'&&(typeof r.value!=='string'||r.value.length>12000))throw Error('メモの形式が正しくありません。');if(['known','saved'].includes(g)&&typeof r.value!=='boolean')throw Error('習得記録の形式が正しくありません。');if(r.alternates&&(!Array.isArray(r.alternates)||r.alternates.length>10||!r.alternates.every(v=>v&&typeof v.value==='string'&&v.value.length<=12000&&Number.isSafeInteger(v.clock)&&typeof v.device==='string')))throw Error('メモ履歴の形式が正しくありません。');}}
 for(const[date,a]of Object.entries(doc.activity)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!a||!['items','questions'].every(g=>Array.isArray(a[g])&&a[g].every(safeKey)))throw Error('学習日の形式が正しくありません。');}
 for(const g of groups)for(const r of Object.values(doc.groups[g])){
  if(r.clock>doc.clock)throw Error('記録の更新時刻が正しくありません。');
  if(r.value===null)continue;
  if(g==='history'&&(!safeKey(r.value.id)||!Number.isFinite(Date.parse(r.value.date))||!Array.isArray(r.value.questions)||r.value.questions.length>1000||!r.value.questions.every(isQuestion)||!r.value.answers||typeof r.value.answers!=='object'||!Number.isInteger(r.value.correct)||r.value.correct<0||r.value.correct>r.value.questions.length||r.value.total!==r.value.questions.length))throw Error('試験履歴の形式が正しくありません。');
  if(g==='mistakes'&&(!safeKey(r.value.id)||!isQuestion(r.value.question)))throw Error('復習問題の形式が正しくありません。');
  if(g==='custom'&&(!['kanji','vocab','grammar'].includes(r.value.type)||!isCard(r.value.item)))throw Error('追加教材の形式が正しくありません。');
 }
 return doc;
}
function noteVersions(...regs){const all=regs.flatMap(r=>r?[{value:r.value,clock:r.clock,device:r.device},...(r.alternates||[])]:[]);const unique=new Map();for(const r of all)if(typeof r.value==='string'){const key=r.clock+':'+r.device+':'+r.value;if(!unique.has(key))unique.set(key,r);}return [...unique.values()].sort((a,b)=>ordered(b,a));}
function merge(a,b){if(!a)return copy(validate(b,b.owner));if(!b)return copy(validate(a,a.owner));validate(a,a.owner);validate(b,a.owner);const out=empty(a.owner);out.clock=Math.max(a.clock,b.clock);for(const g of groups){for(const key of new Set([...Object.keys(a.groups[g]),...Object.keys(b.groups[g])])){const x=a.groups[g][key],y=b.groups[g][key],winner=!x?y:!y?x:ordered(x,y)>=0?x:y;out.groups[g][key]=copy(winner);if(g==='notes'){const versions=noteVersions(x,y);out.groups[g][key].alternates=versions.filter(v=>v.clock!==winner.clock||v.device!==winner.device||v.value!==winner.value).slice(0,10);}}}for(const date of new Set([...Object.keys(a.activity),...Object.keys(b.activity)])){const x=a.activity[date]||{},y=b.activity[date]||{};out.activity[date]={items:[...new Set([...(x.items||[]),...(y.items||[])])].sort(),questions:[...new Set([...(x.questions||[]),...(y.questions||[])])].sort()};}return out;}
function snapshot(doc){validate(doc,doc.owner);const visible=g=>Object.values(doc.groups[g]).filter(r=>r.value!==null).map(r=>copy(r.value));const s={known:Object.entries(doc.groups.known).filter(([,r])=>r.value).map(([k])=>k),saved:Object.entries(doc.groups.saved).filter(([,r])=>r.value).map(([k])=>k),notes:Object.fromEntries(Object.entries(doc.groups.notes).filter(([,r])=>r.value).map(([k,r])=>[k,r.value])),activity:copy(doc.activity),history:visible('history').sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,30),mistakes:visible('mistakes'),custom:{kanji:[],vocab:[],grammar:[]},active:null};for(const value of visible('custom'))if(['kanji','vocab','grammar'].includes(value.type)&&value.item)s.custom[value.type].push(value.item);return s;}
function capture(doc,s,device,now=Date.now()){
 validate(doc,doc.owner);const out=copy(doc);let changed=false;const clock=Math.max(now,out.clock+1);
 const desired={known:Object.fromEntries((s.known||[]).map(k=>[k,true])),saved:Object.fromEntries((s.saved||[]).map(k=>[k,true])),notes:s.notes||{},history:Object.fromEntries((s.history||[]).map(v=>[v.id,v])),mistakes:Object.fromEntries((s.mistakes||[]).map(v=>[v.id,v])),custom:{}};
 for(const type of ['kanji','vocab','grammar'])for(const item of s.custom?.[type]||[])desired.custom[item.id]={type,item};
 for(const g of groups)for(const k of new Set([...Object.keys(out.groups[g]),...Object.keys(desired[g])])){
  if(!safeKey(k))continue;const fallback=['known','saved'].includes(g)?false:g==='notes'?'':null;const value=Object.hasOwn(desired[g],k)?desired[g][k]:fallback;const before=out.groups[g][k];if(equal(before?.value??fallback,value))continue;
  const next={value:copy(value),clock,device};if(g==='notes')next.alternates=noteVersions(before).slice(0,10);out.groups[g][k]=next;changed=true;
 }
 for(const[date,a]of Object.entries(s.activity||{})){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const old=out.activity[date]||{items:[],questions:[]};const next={items:[...new Set([...old.items,...(a.items||[]).filter(safeKey)])].sort(),questions:[...new Set([...old.questions,...(a.questions||[]).filter(safeKey)])].sort()};if(!equal(old,next)){out.activity[date]=next;changed=true;}}
 if(changed)out.clock=clock;return {document:out,changed};
}
// Share question snapshots across attempts so thirty mock exams do not repeat the same passages thirty times.
function pack(doc){const out=copy(doc),bank={},keys=new Map();let n=0;const intern=q=>{const value=JSON.stringify(stable(q));if(!keys.has(value)){const key='q'+(++n);keys.set(value,key);bank[key]=q;}return keys.get(value);};for(const key of Object.keys(out.groups.history).sort()){const r=out.groups.history[key];if(r.value?.questions){r.value.questionRefs=r.value.questions.map(intern);delete r.value.questions;}}for(const key of Object.keys(out.groups.mistakes).sort()){const r=out.groups.mistakes[key];if(r.value?.question){r.value.questionRef=intern(r.value.question);delete r.value.question;}}out.questionBank=bank;return out;}
function unpack(value,owner){const out=copy(value);for(const r of Object.values(out.groups?.history||{}))if(r.value?.questionRefs){r.value.questions=r.value.questionRefs.map(k=>{if(!out.questionBank?.[k])throw Error('問題の参照がありません。');return out.questionBank[k];});delete r.value.questionRefs;}for(const r of Object.values(out.groups?.mistakes||{}))if(r.value?.questionRef){if(!out.questionBank?.[r.value.questionRef])throw Error('問題の参照がありません。');r.value.question=out.questionBank[r.value.questionRef];delete r.value.questionRef;}delete out.questionBank;return validate(out,owner);}
const serialize=doc=>JSON.stringify(stable(pack(doc)),null,2);
return {empty,validate,merge,capture,snapshot,pack,unpack,noteVersions,serialize};
});
