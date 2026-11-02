const headers=(origin)=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'});
const json=(value,status,origin)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
export async function handle(request,env,upstream=fetch){
 let app;try{app=new URL(env.APP_URL);if(app.protocol!=='https:')throw Error();}catch{return new Response('APP_URL is not configured',{status:503});}
 const origin=app.origin,path=new URL(request.url).pathname;
 if(request.headers.get('Origin')!==origin)return new Response('Origin not allowed',{status:403,headers:{'Cache-Control':'no-store'}});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers(origin),'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
 if(path==='/config'&&request.method==='GET')return json({clientId:env.GITHUB_CLIENT_ID||'',appUrl:app.href,configured:!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET)},200,origin);
 if(path!=='/token'||request.method!=='POST')return json({error:'not_found'},404,origin);
 if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)return json({error:'auth_not_configured'},503,origin);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'json_required'},415,origin);
 if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'request_too_large'},413,origin);
 let body;try{const reader=request.body?.getReader();if(!reader)return json({error:'invalid_json'},400,origin);const chunks=[];let size=0;while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'request_too_large'},413,origin);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'invalid_json'},400,origin);}
 if(typeof body.code!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(body.code)||typeof body.codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.codeVerifier)||body.redirectUri!==app.href)return json({error:'invalid_request'},400,origin);
 try{
  const response=await upstream('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded','User-Agent':'Kotonoha-N1'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:body.code,code_verifier:body.codeVerifier,redirect_uri:app.href}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||data.error||typeof data.access_token!=='string')return json({error:'authorization_failed'},400,origin);
  return json({accessToken:data.access_token,scope:data.scope||'',expiresIn:Number(data.expires_in)||null},200,origin);
 }catch{return json({error:'authorization_unavailable'},502,origin);}
}
export default {fetch(request,env){return handle(request,env);}};
