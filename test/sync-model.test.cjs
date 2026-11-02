const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../docs/sync-model.js');
const blank=()=>({known:[],saved:[],notes:{},activity:{},history:[],mistakes:[],custom:{kanji:[],vocab:[],grammar:[]},active:null});
test('concurrent progress merges, removals remain removed after reconnect',()=>{
 const base=M.empty(100),a=M.capture(base,{...blank(),known:['g1']},'a',1000).document,b=M.capture(base,{...blank(),saved:['k2']},'b',1000).document;
 const merged=M.merge(a,b);assert.deepEqual(M.snapshot(merged).known,['g1']);assert.deepEqual(M.snapshot(merged).saved,['k2']);
 assert.deepEqual(M.merge(a,b),M.merge(b,a));
 const removed=M.capture(merged,{...M.snapshot(merged),known:[]},'b',500).document;
 assert.deepEqual(M.snapshot(M.merge(a,removed)).known,[]);
});
test('both devices retain note text and deletion is a tombstone',()=>{
 const a=M.capture(M.empty(100),{...blank(),notes:{g1:'端末Aの例文'}},'a',2000).document;
 const b=M.capture(M.empty(100),{...blank(),notes:{g1:'端末Bの例文'}},'b',2000).document;
 const merged=M.merge(a,b),versions=M.noteVersions(merged.groups.notes.g1);
 assert.deepEqual(new Set(versions.map(x=>x.value)),new Set(['端末Aの例文','端末Bの例文']));
 const deleted=M.capture(merged,{...M.snapshot(merged),notes:{}},'a',2001).document;
 assert.equal(M.snapshot(M.merge(deleted,b)).notes.g1,undefined);
 assert(M.noteVersions(deleted.groups.notes.g1).some(x=>x.value==='端末Aの例文'));
});
test('accounts cannot read or merge each other\'s records',()=>{
 assert.throws(()=>M.merge(M.empty(100),M.empty(200)),/アカウント/);
 const bad=M.empty(100);bad.groups.notes=JSON.parse('{"__proto__":{"value":"x","clock":0,"device":"a"}}');
 assert.throws(()=>M.validate(bad,100));
});
test('same-device simultaneous writes converge and canonical bytes do not cause repeat commits',()=>{
 const a=M.capture(M.empty(100),{...blank(),notes:{g1:'同じ端末のA'}},'same-device',1000).document;
 const b=M.capture(M.empty(100),{...blank(),notes:{g1:'同じ端末のB'}},'same-device',1000).document;
 assert.equal(M.serialize(M.merge(a,b)),M.serialize(M.merge(b,a)));
 assert.equal(M.noteVersions(M.merge(a,b).groups.notes.g1).length,2);
 assert.equal(M.serialize(M.merge(a,b)),M.serialize(M.merge(M.merge(a,b),a)));
});
test('malformed cloud question data is rejected before it can reach the UI',()=>{
 const doc=M.empty(100);doc.clock=1;doc.groups.mistakes.bad={clock:1,device:'a',value:{id:'bad',question:{options:[]}}};
 assert.throws(()=>M.validate(doc,100),/復習問題/);
});
test('activity is a union and active timed exams stay device-local',()=>{
 const a=M.capture(M.empty(100),{...blank(),activity:{'2026-11-02':{items:['v1'],questions:['r1']}},active:{deadline:1}},'a',1000).document;
 const b=M.capture(M.empty(100),{...blank(),activity:{'2026-11-02':{items:['v2'],questions:['r1','r2']}}},'b',1001).document;
 const s=M.snapshot(M.merge(a,b));assert.deepEqual(s.activity['2026-11-02'],{items:['v1','v2'],questions:['r1','r2']});assert.equal(s.active,null);
});
test('question snapshots are deduplicated and survive JSON roundtrip',()=>{
 const q={id:'r1',category:'短文',passage:'文章'.repeat(100),question:'何か',options:['A','B','C','D'],answer:2,explanation:'説明です',zh:'中文解析'};
 const s={...blank(),history:[{id:'a',date:'2026-11-02T01:00:00Z',questions:[q],answers:{r1:2},correct:1,total:1},{id:'b',date:'2026-11-02T02:00:00Z',questions:[q],answers:{r1:0},correct:0,total:1}],mistakes:[{id:'r1',question:q,selected:0}]};
 const doc=M.capture(M.empty(100),s,'a',1000).document,packed=M.pack(doc);
 assert.equal(Object.keys(packed.questionBank).length,1);
 const restored=M.unpack(JSON.parse(JSON.stringify(packed)),100);assert.deepEqual(M.snapshot(restored).history[0].questions[0],q);
});
