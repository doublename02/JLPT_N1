import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/index.js';
const env={APP_URL:'https://doublename02.github.io/JLPT_N1/',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'never-expose-me'};
const request=(body,origin='https://doublename02.github.io')=>new Request('https://auth.example/token',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const valid={code:'test-code',codeVerifier:'a'.repeat(64),redirectUri:env.APP_URL};
test('rejects other origins and redirect destinations before exchanging any code',async()=>{
 const fail=()=>assert.fail('must not contact GitHub');
 assert.equal((await handle(request(valid,'https://untrusted.example'),env,fail)).status,403);
 assert.equal((await handle(request({...valid,redirectUri:'https://untrusted.example'}),env,fail)).status,400);
 assert.equal((await handle(request({...valid,codeVerifier:'short'}),env,fail)).status,400);
});
test('OAuth exchange sends PKCE and secret server-side only',async()=>{
 const response=await handle(request(valid),env,async(url,init)=>{
  assert.equal(url,'https://github.com/login/oauth/access_token');
  assert.equal(init.body.get('client_secret'),env.GITHUB_CLIENT_SECRET);
  assert.equal(init.body.get('code_verifier'),valid.codeVerifier);
  return Response.json({access_token:'test-user-token',scope:'repo',refresh_token:'never-send-refresh-token',expires_in:28800});
 });
 assert.equal(response.status,200);const body=await response.text();assert(!body.includes(env.GITHUB_CLIENT_SECRET));assert(!body.includes('never-send-refresh-token'));
 assert.equal(JSON.parse(body).accessToken,'test-user-token');assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('config publishes client ID, never secrets; missing configuration fails closed',async()=>{
 const req=new Request('https://auth.example/config',{headers:{Origin:'https://doublename02.github.io'}});
 const body=await(await handle(req,env)).text();assert(!body.includes(env.GITHUB_CLIENT_SECRET));assert.equal(JSON.parse(body).configured,true);
 assert.equal((await handle(request(valid),{...env,GITHUB_CLIENT_SECRET:''})).status,503);
});
test('upstream errors cannot reflect secrets into browser responses',async()=>{
 const response=await handle(request(valid),env,async()=>Response.json({error:'bad_verification_code',error_description:env.GITHUB_CLIENT_SECRET},{status:400}));
 assert.equal(response.status,400);assert(!(await response.text()).includes(env.GITHUB_CLIENT_SECRET));
});
