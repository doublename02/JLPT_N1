import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const elements = new Map();
class Element {
  innerHTML=''; textContent=''; value=''; open=false; dataset={};
  classList={add(){},remove(){},toggle(){}};
  addEventListener(){} setAttribute(){} focus(){} setSelectionRange(){} scrollIntoView(){} click(){}
  querySelector(){return new Element();}querySelectorAll(){return [];}
  showModal(){this.open=true;}close(){this.open=false;}append(){}after(){}
}
function makeApp(stored){
  const els=new Map();const intervals=[];let storage=stored||null;
  const document={querySelector(s){if(!els.has(s))els.set(s,new Element());return els.get(s);},querySelectorAll(){return [];},addEventListener(){},createElement(){return new Element();},body:new Element(),title:''};
  const window={addEventListener(){},scrollTo(){}};
  const ctx=vm.createContext({window,document,location:{hash:'#home'},localStorage:{getItem(){return storage;},setItem(k,v){storage=v;}},setInterval(f){intervals.push(f);return intervals.length;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},Date,Intl,Blob,URL,console});
  const scripts=[...fs.readFileSync('docs/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(f=>!['app.js','github-sync.js'].includes(f));
  for(const file of scripts)vm.runInContext(fs.readFileSync(`docs/${file}`,'utf8'),ctx);
  let source=fs.readFileSync('docs/app.js','utf8').replaceAll('\r\n','\n');
  source=source.replace("render();\nif(window.KotonohaCloud)", `window.test={startExam,finishSection,sectionData,renderCatalog,renderHome,renderAbout,renderReview,renderProgress,renderResult,renderQuestionReview,record,get memory(){return memory;},get catalog(){return catalog;},allKnowledge,knowledge};render();\nif(window.KotonohaCloud)`);
  vm.runInContext(source,ctx);
  return {ctx,window,api:window.test,els,intervals,getStorage:()=>storage};
}
const app=makeApp(),{api,window:w}=app;
const counts={};
const ids=new Set();
for(const type of ['kanji','vocab','grammar']){
  const data=w.KNOWLEDGE[type];counts[type]=data.length;
  assert.equal(new Set(data.map(x=>x.title.normalize('NFKC'))).size,data.length,`Duplicate ${type} titles`);
  for(const x of data){for(const key of ['id','title','reading','category','jp','zh','example','translation']){assert.equal(typeof x[key],'string',`${type} ${x.id} ${key}`);assert(x[key].trim().length>0,`Empty ${type} ${x.id} ${key}`);}assert(!ids.has(x.id));ids.add(x.id);assert(x.example.length>=6);assert(x.translation.length>=3);assert(/\p{Script=Han}/u.test(x.zh));if(type==='kanji')assert.equal([...x.title].length,1,`Not one kanji ${x.id}`);}
}
assert(api.allKnowledge().length>=2200,'Expanded collection must exceed 2200 cards');
assert(w.KNOWLEDGE.grammar.some(x=>x.focus==='関連文法'));
const simpleGrammarTitles=new Set(w.KNOWLEDGE.grammar.map(x=>x.title.replaceAll('〜','')));
for(const card of w.KNOWLEDGE.vocab)assert(!simpleGrammarTitles.has(card.title),`Grammar-only duplicate in vocabulary: ${card.title}`);
const expected=[['reading',w.EXAMS.reading,26],['listening',w.EXAMS.listening,30],['language',w.LANGUAGE_EXAM,45]];
for(const [name,questions,count] of expected){counts[name]=questions.length;assert.equal(questions.length,count);for(const q of questions){assert(!ids.has(q.id));ids.add(q.id);assert.equal(typeof q.question,'string');assert(q.options.length>=3&&q.options.length<=4);assert.equal(new Set(q.options).size,q.options.length);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length);assert(q.explanation.length>10);assert(q.zh.length>5);if(name==='reading')assert(q.passage.length>=140);if(name==='listening')assert(q.script.length>20);}}
assert.deepEqual(w.EXAMS.reading.reduce((a,q)=>(a[q.category]=(a[q.category]||0)+1,a),{}),{'内容理解（短文）':4,'内容理解（中文）':9,'内容理解（長文）':4,'統合理解':3,'主張理解（長文）':4,'情報検索':2});
assert.deepEqual(w.EXAMS.listening.reduce((a,q)=>(a[q.category]=(a[q.category]||0)+1,a),{}),{'課題理解':5,'ポイント理解':6,'概要理解':5,'即時応答':11,'統合理解':3});
for(const type of ['kanji','vocab','grammar'])api.renderCatalog(type);
api.catalog.focus='関連知識';api.renderCatalog('grammar');
assert(app.els.get('#main').innerHTML.includes('50 項目'));
api.catalog.focus='all';api.catalog.status='expanded';api.renderCatalog('grammar');
assert(app.els.get('#main').innerHTML.includes('30 項目'));
api.catalog.status='previous';api.renderCatalog('grammar');
assert(app.els.get('#main').innerHTML.includes('95 項目'));
api.catalog.status='all';api.catalog.query='施策';api.renderCatalog('vocab');
assert(app.els.get('#main').innerHTML.includes('va001'));
api.catalog.query='';
api.renderAbout();api.renderProgress();api.renderReview();api.renderHome();
api.startExam('full');assert.equal(api.sectionData().length,71);const initial=api.memory.active;
for(const q of api.sectionData())initial.answers[q.id]=q.answer;
api.finishSection();assert.equal(initial.phase,'break');assert.equal(initial.parts.length,1);assert.equal(initial.parts[0].questions.length,71);
initial.section=1;initial.phase='running';initial.cursor=0;initial.answers={};initial.deadline=Date.now()+55*60000;
const listeningQuestions=api.sectionData();assert.equal(listeningQuestions.length,30);
for(const q of listeningQuestions)initial.answers[q.id]=q.answer;
api.finishSection();assert.equal(api.memory.active,null);assert.equal(api.memory.history[0].total,101);assert.equal(api.memory.history[0].correct,101);assert.equal(api.memory.mistakes.length,0);
const result=api.memory.history[0];api.renderQuestionReview(result);assert(app.els.get('#result-review').innerHTML.includes('正解'));
api.startExam('reading');api.finishSection();assert.equal(api.memory.history[0].correct,0);assert.equal(api.memory.mistakes.length,26);
api.startExam('mistakes',api.memory.mistakes.map(m=>m.question));for(const q of api.sectionData())api.memory.active.answers[q.id]=q.answer;api.finishSection();assert.equal(api.memory.mistakes.length,0);
api.startExam('listening');api.memory.active.answers.l1=2;api.record('g1');
const resumed=makeApp(app.getStorage());assert.equal(resumed.api.memory.active.mode,'listening');assert.equal(resumed.api.memory.active.answers.l1,2);assert.equal(resumed.api.sectionData().length,30);
resumed.api.memory.active.deadline=Date.now()-1000;resumed.intervals[0]();assert.equal(resumed.api.memory.active,null);assert.equal(resumed.api.memory.history[0].total,30);
const report={counts,checks:['content schemas and unique IDs','official indicative counts','all catalog and dashboard renders','two-stage full mock and answer locking','correct/wrong/unanswered grading','mistake removal after retry','persisted exam reload','deadline expiry auto-submit','answer and bilingual explanation review'],status:'passed'};
console.log(JSON.stringify(report,null,2));
