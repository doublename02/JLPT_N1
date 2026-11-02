/* GitHub is the user's own storage. Credentials live in memory, never in localStorage or repository JSON. */
(function(root){
'use strict';
const Model=root.KotonohaSyncModel;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const encode=value=>{const bytes=new TextEncoder().encode(value);let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const decode=value=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const MAX_BYTES=4*1024*1024;
const FILE='.kotonoha/profile-v2.json';
const STORAGE='kotonoha-github-v2';
function create(options){
 const config=root.KOTONOHA_GITHUB||{};
 const settings={mode:'private',auto:true};
 try{const old=JSON.parse(localStorage.getItem(STORAGE+':settings')||'null');if(old){if(['private','fork'].includes(old.mode))settings.mode=old.mode;settings.auto=old.auto!==false;}}catch{}
 let device;try{device=localStorage.getItem(STORAGE+':device');if(!device){device=crypto.randomUUID();localStorage.setItem(STORAGE+':device',device);}}catch{device=crypto.randomUUID();}
 let account=null,token=null,repository=null,document=null,dirty=false,timer=null,inflight=null,connecting=false,epoch=0,status='未接続',lastError='',lastSynced=null;
 const prefix=user=>`${STORAGE}:document:${user.id}`;
 const current=()=>({account,repository,status,lastError,lastSynced,dirty,configured:!!config.authBaseUrl,auto:settings.auto,mode:settings.mode});
 function emit(label,error=''){status=label;lastError=error;options.onStatus?.(current());}
 function persist(){if(document&&account){try{localStorage.setItem(prefix(account),Model.serialize(document));}catch{emit('端末の空き容量不足','バックアップを保存し、ブラウザーの保存領域を確認してください。');}}}
 function loadDocument(user){try{const raw=localStorage.getItem(prefix(user));return raw?Model.unpack(JSON.parse(raw),user.id):Model.empty(user.id);}catch{throw Error('このアカウントの端末記録を読み込めません。バックアップを確認してください。');}}
 async function api(path,{method='GET',body,raw=false,allow404=false}={}){
  const response=await fetch('https://api.github.com'+path,{method,headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.status===404&&allow404)return null;
  let data;try{data=await response.json();}catch{data={};}
  if(!response.ok){const error=new Error(response.status===401?'GitHubへの接続が切れました。もう一度ログインしてください。':response.status===403?'GitHubの権限または利用制限により保存できません。記録は端末に残っています。':`GitHubへの保存に失敗しました（${response.status}）。端末の記録は保持されています。`);error.status=response.status;throw error;}
  return data;
 }
 function repoPath(){return '/repos/'+encodeURIComponent(account.login)+'/'+encodeURIComponent(repository.name);}
 async function verifyRepository(){const data=await api(repoPath());if(String(data.owner?.id)!==String(account.id))throw Error('保存先がログイン中のアカウントに属していません。');if(settings.mode==='private'&&!data.private)throw Error('学習用リポジトリが公開になっています。非公開に戻すまで同期を停止します。');if(settings.mode==='fork'&&(!data.fork||data.parent?.full_name?.toLowerCase()!==config.upstream.toLowerCase()))throw Error('選択したリポジトリはこのサイトのForkではありません。');repository={...repository,branch:data.default_branch,private:data.private,htmlUrl:data.html_url};return data;}
 async function ensureRepository(){
  const name=settings.mode==='fork'?config.upstream.split('/')[1]:config.dataRepository;
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name||''))throw Error('保存先の設定が正しくありません。');
  repository={name};let repo=await api(repoPath(),{allow404:true});
  if(!repo){
   if(settings.mode==='private')repo=await api('/user/repos',{method:'POST',body:{name,private:true,auto_init:true,description:'Personal Kotonoha N1 notes and learning progress'}});
   else{
    if(account.login.toLowerCase()===config.upstream.split('/')[0].toLowerCase())throw Error('サイト所有者は自分のサイトをForkできません。非公開の学習用リポジトリをご利用ください。');
    await api('/repos/'+config.upstream+'/forks',{method:'POST',body:{name,default_branch_only:true}});
   }
  }
  for(let i=0;i<8;i++){try{repo=await verifyRepository();if(repo.default_branch)return;}catch(error){if(error.status!==404)throw error;}await sleep(1000);}
  throw Error('保存先の準備中です。少し待ってから接続し直してください。');
 }
 async function readRemote(){
  const meta=await api(repoPath()+'/contents/'+FILE+'?ref='+encodeURIComponent(repository.branch),{allow404:true});
  if(!meta)return {sha:null,document:null};
  if(meta.type!=='file'||meta.size>MAX_BYTES)throw Error('学習記録のファイル形式または容量を確認してください。');
  let value;if(meta.encoding==='base64'&&meta.content)value=JSON.parse(decode(meta.content));else value=await api(repoPath()+'/contents/'+FILE+'?ref='+encodeURIComponent(repository.branch),{raw:true});
  return {sha:meta.sha,document:Model.unpack(value,account.id)};
 }
 function schedule(){clearTimeout(timer);if(settings.auto&&account&&dirty)timer=setTimeout(()=>flush().catch(()=>{}),15000);}
 function changed(snapshot){if(!account||!document)return;const result=Model.capture(document,snapshot,device);if(!result.changed)return;document=result.document;dirty=true;persist();emit('端末に保存・同期待ち');schedule();}
 async function flush(){
  clearTimeout(timer);if(!account||!document)throw Error('先にGitHubに接続してください。');
  if(inflight){await inflight;if(dirty)return flush();return;}
  const startedEpoch=epoch;
  inflight=(async()=>{
   emit('GitHubと同期中…');
   try{
    await verifyRepository();
    for(let attempt=0;attempt<3;attempt++){
     const remote=await readRemote();if(epoch!==startedEpoch)return;
     const merged=Model.merge(document,remote.document),body=Model.serialize(merged);
     if(new TextEncoder().encode(body).length>MAX_BYTES)throw Error('同期容量が4MBを超えています。端末のバックアップを保存し、履歴や追加教材を整理してください。');
     const same=remote.document&&Model.serialize(remote.document)===Model.serialize(merged);
     if(!same){try{await api(repoPath()+'/contents/'+FILE,{method:'PUT',body:{message:'Save personal learning records [skip ci]',content:encode(body),branch:repository.branch,...(remote.sha?{sha:remote.sha}:{})}});}catch(error){if([409,422].includes(error.status)&&attempt<2)continue;throw error;}}
     if(epoch!==startedEpoch)return;
     document=Model.merge(document,merged);dirty=Model.serialize(document)!==Model.serialize(merged);persist();lastSynced=new Date().toISOString();
     options.applySnapshot?.(Model.snapshot(document),account);
     emit(dirty?'端末に保存・同期待ち':'GitHubに保存済み');if(dirty)schedule();return;
    }
   }catch(error){if(epoch===startedEpoch){dirty=true;persist();emit('同期できませんでした',error.message);}throw error;}
  })();
  try{await inflight;}finally{inflight=null;}
 }
 async function connect(accessToken,mode){
  if(!['private','fork'].includes(mode))throw Error('保存方法を選んでください。');
  if(connecting)throw Error('接続の準備中です。少しお待ちください。');
  if(inflight)await inflight.catch(()=>{});
  connecting=true;
  epoch++;clearTimeout(timer);token=accessToken;account=null;repository=null;document=null;dirty=false;
  try{
   const user=await api('/user');if(!Number.isSafeInteger(user.id)||typeof user.login!=='string')throw Error('GitHubアカウントを確認できません。');
   account={id:user.id,login:user.login};settings.mode=mode;localStorage.setItem(STORAGE+':settings',JSON.stringify(settings));emit('保存先を準備中…');
   await ensureRepository();document=loadDocument(account);const remote=await readRemote();document=Model.merge(document,remote.document);dirty=Model.serialize(document)!==Model.serialize(remote.document||Model.empty(account.id));persist();
   options.applySnapshot?.(Model.snapshot(document),account);emit(dirty?'端末に保存・同期待ち':'GitHubに接続済み');if(dirty)schedule();
  }catch(error){token=null;account=null;repository=null;document=null;emit('接続できませんでした',error.message);throw error;}finally{connecting=false;}
 }
 async function login(mode){
  if(!config.authBaseUrl)throw Error('通常のGitHubログインは管理者の設定待ちです。接続用トークンを使う場合は、詳細設定から接続できます。');
  const auth=new URL(config.authBaseUrl);if(auth.protocol!=='https:')throw Error('認証サービスのURLが正しくありません。');
  const response=await fetch(new URL('/config',auth),{cache:'no-store'});const info=await response.json();
  const redirectUri=new URL('./',location.href).href.split('#')[0].split('?')[0];
  if(!response.ok||!info.configured||info.appUrl!==redirectUri||!info.clientId)throw Error('認証サービスの設定が完了していません。');
  if(config.clientId&&config.clientId!==info.clientId)throw Error('Client IDの設定が一致していません。');
  const verifier=random()+random(),state=random(),challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem(STORAGE+':oauth',JSON.stringify({verifier,state,mode,redirectUri,returnHash:location.hash,createdAt:Date.now()}));
  const url=new URL('https://github.com/login/oauth/authorize');url.search=new URLSearchParams({client_id:info.clientId,redirect_uri:redirectUri,scope:mode==='private'?'repo':'public_repo',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();location.assign(url.href);
 }
 async function init(){
  const url=new URL(location.href),code=url.searchParams.get('code'),denied=url.searchParams.get('error');if(!code&&!denied)return;
  let pending;try{pending=JSON.parse(sessionStorage.getItem(STORAGE+':oauth')||'null');}catch{}
  sessionStorage.removeItem(STORAGE+':oauth');const state=url.searchParams.get('state');url.searchParams.delete('code');url.searchParams.delete('state');url.searchParams.delete('error');history.replaceState(null,'',url.pathname+url.search+(pending?.returnHash||'#progress'));
  try{
   if(!pending||pending.state!==state||Date.now()-pending.createdAt>10*60000||!config.authBaseUrl)throw Error('ログインの確認に失敗しました。もう一度ログインしてください。');
   if(denied)throw Error('GitHubログインが中止されました。端末の学習記録は保持されています。');
   const response=await fetch(new URL('/token',config.authBaseUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,codeVerifier:pending.verifier,redirectUri:pending.redirectUri})});
   const data=await response.json();if(!response.ok||!data.accessToken)throw Error('GitHubログインを完了できませんでした。もう一度お試しください。');
   await connect(data.accessToken,pending.mode);options.toast?.('GitHubに接続しました。個人用の記録を読み込みました。');
  }catch(error){emit('接続できませんでした',error.message);options.toast?.(error.message);open();}
 }
 async function disconnect(){if(connecting)throw Error('接続の準備中です。少しお待ちください。');if(inflight)await inflight.catch(()=>{});epoch++;clearTimeout(timer);token=null;account=null;repository=null;document=null;dirty=false;lastSynced=null;options.applySnapshot?.(null,null);emit('未接続');}
 function versions(id){return document?Model.noteVersions(document.groups.notes[id]):[];}
 function open(){
  let dialog=documentElement('github-sync-dialog');if(!dialog){dialog=root.document.createElement('dialog');dialog.id='github-sync-dialog';dialog.className='sync-dialog';root.document.body.append(dialog);}
  const connected=!!account;
  dialog.innerHTML=`<button class="dialog-close" id="cloud-close" aria-label="閉じる">×</button><span class="badge">自分のGitHubに、自分の学びを。</span><h2>学習記録をつなぐ</h2><p class="sync-description">端末にはすぐ保存し、GitHubには変更をまとめて保存します。進行中の計時試験はこの端末で復元でき、提出後の結果はほかの端末にも同期できます。</p>${connected?`<div class="sync-identity"><strong>@${esc(account.login)}</strong><span class="badge">${repository?.private?'非公開':'公開Fork'}</span></div><div class="sync-state">${esc(status)}</div>${lastError?`<p class="sync-error">${esc(lastError)}</p>`:''}<p class="sync-description"><a href="${esc(repository?.htmlUrl||'https://github.com')}" target="_blank" rel="noopener noreferrer">保存先：${esc(account.login+'/'+repository?.name)} ↗</a><br>${lastSynced?'最終同期：'+esc(new Date(lastSynced).toLocaleString('ja-JP')):'まだ変更は保存されていません。'}<br>保存先：.kotonoha/profile-v2.json</p><label class="sync-check"><input type="checkbox" id="cloud-auto" ${settings.auto?'checked':''}> 変更をまとめて自動同期（約15秒後）</label><div class="sync-actions"><button class="button" id="cloud-now">今すぐ同期</button><button class="button secondary" id="cloud-import">未ログイン時の記録を取り込む</button></div><p class="sync-description">取り込む前の未ログイン記録は端末にも残ります。異なる端末のメモ編集は変更履歴から確認できます。GitHubの変更履歴には以前の内容が残るため、機密情報は書き込まないでください。</p><button class="text-link" id="cloud-logout">ログアウト（端末の記録は保持）</button>`:`<div class="sync-choice"><label class="sync-check"><input name="cloud-mode" type="radio" value="private" ${settings.mode==='private'?'checked':''}> 非公開の学習用リポジトリ（おすすめ）</label><p>あなたのアカウントに <b>${esc(config.dataRepository)}</b> を用意します。サイト本体を複製せず、メモと学習記録だけを保存します。</p><label class="sync-check"><input name="cloud-mode" type="radio" value="fork" ${settings.mode==='fork'?'checked':''}> サイトをForkして、公開で保存</label><p>公開Forkでは、メモ・学習記録・過去の変更履歴を誰でも読めます。公開してよい内容だけを保存してください。</p></div><p class="sync-description">非公開同期はGitHubの「repo」権限、公開Forkは「public_repo」権限で接続します。アプリは自分の学習用保存先だけを操作します。権限を一つのリポジトリに制限したい場合は、詳細設定で限定トークンを使えます。</p><button class="button" id="cloud-login">GitHubでログイン${config.authBaseUrl?'':'（管理者の設定待ち）'}</button>${!config.authBaseUrl?'<p class="sync-description">通常ログインは認証サービスの設定後に利用できます。ログインなしでも学習と端末保存は利用できます。</p>':''}${lastError?`<p class="sync-error">${esc(lastError)}</p>`:''}<details class="sync-advanced"><summary>詳細設定：自分の接続用トークンを使う</summary><p class="sync-description">選択した学習用リポジトリの Contents 読み書きが許可されたトークンで接続できます。限定トークンの場合は先に非公開の保存先を作成してください。トークンはこの画面のメモリーだけで使用し、記録ファイルやブラウザーの保存領域には保存しません。</p><label for="cloud-token">GitHubの接続用トークン</label><input id="cloud-token" type="password" autocomplete="off" spellcheck="false"><button class="button secondary" id="cloud-token-connect">自分のGitHubに接続する</button></details>`}<div class="sync-state" id="cloud-action-status" role="status"></div>`;
  dialog.querySelector('#cloud-close').onclick=()=>dialog.close();
  const run=async(fn)=>{const el=dialog.querySelector('#cloud-action-status');el.textContent='処理中…';const buttons=[...dialog.querySelectorAll('button')].filter(b=>b.id!=='cloud-close');buttons.forEach(b=>b.disabled=true);try{await fn();if(dialog.open)open();}catch(error){el.textContent=error.message;options.toast?.(error.message);}finally{buttons.forEach(b=>b.disabled=false);}};
  if(connected){dialog.querySelector('#cloud-auto').onchange=e=>{settings.auto=e.target.checked;localStorage.setItem(STORAGE+':settings',JSON.stringify(settings));schedule();};dialog.querySelector('#cloud-now').onclick=()=>run(flush);dialog.querySelector('#cloud-logout').onclick=()=>run(async()=>{if(dirty&&!confirm('まだGitHubに保存していない変更があります。端末の記録を残してログアウトしますか？'))return;await disconnect();});dialog.querySelector('#cloud-import').onclick=()=>run(async()=>{if(!confirm('未ログイン時のこの端末の記録を、現在のGitHubアカウントに取り込みますか？'))return;const guest=options.getGuestSnapshot?.();if(guest){const imported=Model.capture(Model.empty(account.id),guest,device);document=Model.merge(document,imported.document);dirty=true;persist();options.applySnapshot?.(Model.snapshot(document),account);await flush();}});}
  else{const mode=()=>dialog.querySelector('input[name="cloud-mode"]:checked')?.value||'private';const acceptPublic=()=>mode()!=='fork'||confirm('メモと学習記録が公開されます。公開Forkへの保存を開始しますか？');dialog.querySelector('#cloud-login').onclick=()=>run(async()=>{if(acceptPublic())await login(mode());});dialog.querySelector('#cloud-token-connect').onclick=()=>run(async()=>{if(!acceptPublic())return;const input=dialog.querySelector('#cloud-token'),value=input.value.trim();input.value='';if(!value)throw Error('接続用トークンを入力してください。');await connect(value,mode());});}
  if(!dialog.open)dialog.showModal();
 }
 function documentElement(id){return root.document.getElementById(id);}
 root.addEventListener('online',()=>{if(account&&dirty)schedule();});
 root.document.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&account&&!connecting&&Date.now()-Date.parse(lastSynced||0)>60000)flush().catch(()=>{});});
 root.addEventListener('beforeunload',e=>{if(account&&dirty){e.preventDefault();e.returnValue='';}});
 emit('未接続');return {init,open,changed,flush,disconnect,versions,current};
}
root.KotonohaCloud={create};
})(window);
