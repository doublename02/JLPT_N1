const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const M=require('../docs/sync-model.js');
const blank=()=>({known:[],saved:[],notes:{},activity:{},history:[],mistakes:[],custom:{kanji:[],vocab:[],grammar:[]},active:null});
function harness(){
 class Element{constructor(){this.nodes=new Map();this.value='';this.open=false;this.id='';}set innerHTML(v){this.html=v;this.nodes=new Map();}get innerHTML(){return this.html;}querySelector(s){if(!this.nodes.has(s)){const el=new Element();if(s.includes('cloud-mode'))el.value='private';this.nodes.set(s,el);}return this.nodes.get(s);}querySelectorAll(){return [];}showModal(){this.open=true;}close(){this.open=false;}}
 const elements=new Map(),store=new Map(),sessionStore=new Map(),listeners={};
 const document={getElementById:id=>elements.get(id),createElement:()=>new Element(),body:{append:e=>elements.set(e.id,e)},addEventListener:(k,v)=>listeners[k]=v,visibilityState:'visible'};
 const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const state={user:{id:101,login:'student-a'},private:true,profile:null,revision:0,writes:0,conflict:false,block:null,assignedUrl:null,applied:[],statuses:[]};
 const respond=(value,status=200)=>Response.json(value,{status});
 const fetch=async(url,init={})=>{
  if(url.toString().endsWith('/config'))return respond({configured:true,clientId:'test-client',appUrl:'https://doublename02.github.io/JLPT_N1/'});
  const path=new URL(url).pathname;
  if(path==='/user')return respond(state.user);
  if(path.includes('/contents/')){
   if(init.method==='PUT'){
    state.writes++;
    if(state.conflict){state.conflict=false;state.revision++;state.profile=M.pack(M.capture(M.empty(state.user.id),{...blank(),known:['g9']},'other',1000).document);return respond({},409);}
    if(state.block)await state.block;
    const body=JSON.parse(init.body);assert.equal(body.sha,state.profile?'sha-'+state.revision:undefined);state.profile=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));state.revision++;return respond({content:{sha:'sha-'+state.revision}},201);
   }
   if(!state.profile)return respond({},404);
   if(init.headers.Accept==='application/vnd.github.raw+json')return respond(state.profile);
   return respond({type:'file',size:JSON.stringify(state.profile).length,sha:'sha-'+state.revision,encoding:'base64',content:Buffer.from(JSON.stringify(state.profile)).toString('base64')});
  }
  if(path.startsWith('/repos/'))return respond({name:'JLPT_N1-study-data',private:state.private,owner:state.user,default_branch:'main',html_url:'https://github.com/'+state.user.login+'/JLPT_N1-study-data'});
  throw Error('Unexpected test request '+path);
 };
 const location={href:'https://doublename02.github.io/JLPT_N1/#review',hash:'#review',assign:url=>state.assignedUrl=url};
 const window={document,KotonohaSyncModel:M,KOTONOHA_GITHUB:{upstream:'doublename02/JLPT_N1',dataRepository:'JLPT_N1-study-data',authBaseUrl:'',clientId:''},addEventListener:(k,v)=>listeners[k]=v};
 const ctx={window,document,location,history:{replaceState(){}},localStorage:storage(store),sessionStorage:storage(sessionStore),fetch,crypto:webcrypto,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,Response,confirm:()=>true,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout:()=>1,clearTimeout(){},Date,console};
 vm.runInNewContext(fs.readFileSync('docs/github-sync.js','utf8'),ctx);
 const sdk=window.KotonohaCloud.create({onStatus:s=>state.statuses.push(s.status),applySnapshot:(s,a)=>state.applied.push({snapshot:s,account:a})});
 const connect=async()=>{sdk.open();const d=elements.get('github-sync-dialog');d.querySelector('#cloud-token').value='fake-personal-token';await d.querySelector('#cloud-token-connect').onclick();};
 return {sdk,state,connect,store,sessionStore,window,elements};
}
test('manual GitHub connection isolates account data and never persists credentials',async()=>{
 const h=harness();await h.connect();assert.equal(h.sdk.current().account.id,101);
 h.sdk.changed({...blank(),notes:{g1:'自分のメモ'}});await h.sdk.flush();assert.equal(h.state.profile.owner,'101');
 assert(![...h.store.values()].some(v=>v.includes('fake-personal-token')));
 await h.sdk.disconnect();h.state.user={id:202,login:'student-b'};h.state.profile=null;await h.connect();
 assert.equal(h.sdk.current().account.id,202);assert.deepEqual(h.state.applied.at(-1).snapshot.notes,{});assert.equal(h.state.writes,1);
});
test('SHA conflict reloads and merges remote changes before retry',async()=>{
 const h=harness();await h.connect();h.sdk.changed({...blank(),known:['g1'],notes:{g1:'メモ'}});h.state.conflict=true;await h.sdk.flush();
 const saved=M.snapshot(M.unpack(h.state.profile,101));assert.deepEqual(new Set(saved.known),new Set(['g1','g9']));assert.equal(saved.notes.g1,'メモ');assert.equal(h.state.writes,2);
});
test('edits during an in-flight save stay pending and are saved next',async()=>{
 const h=harness();await h.connect();h.sdk.changed({...blank(),notes:{g1:'最初'}});
 let release;h.state.block=new Promise(r=>release=r);const pending=h.sdk.flush();
 while(h.state.writes===0)await new Promise(r=>setImmediate(r));
 h.sdk.changed({...blank(),notes:{g1:'保存中の新しい編集'}});h.state.block=null;release();await pending;
 assert.equal(h.sdk.current().dirty,true);await h.sdk.flush();assert.equal(M.snapshot(M.unpack(h.state.profile,101)).notes.g1,'保存中の新しい編集');assert.equal(h.sdk.current().dirty,false);
});
test('private storage changing to public stops writes and preserves local pending data',async()=>{
 const h=harness();await h.connect();h.sdk.changed({...blank(),notes:{g1:'非公開のメモ'}});h.state.private=false;
 await assert.rejects(h.sdk.flush(),/公開/);assert.equal(h.state.writes,0);assert.equal(h.sdk.current().dirty,true);assert([...h.store.values()].some(v=>v.includes('非公開のメモ')));
});
test('OAuth launch uses unpredictable state and PKCE, without storing credentials',async()=>{
 const h=harness();h.window.KOTONOHA_GITHUB.authBaseUrl='https://auth.example';h.sdk.open();await h.elements.get('github-sync-dialog').querySelector('#cloud-login').onclick();
 const url=new URL(h.state.assignedUrl),pending=JSON.parse(h.sessionStore.get('kotonoha-github-v2:oauth'));
 assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('state'),pending.state);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(pending.verifier.length,86);assert.equal(url.searchParams.get('redirect_uri'),'https://doublename02.github.io/JLPT_N1/');
});
