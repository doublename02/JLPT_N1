import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A Cloudflare build secret is not a runtime binding. Forward it over stdin, never argv or a file.
export async function deployWithSecret(run,secret){
 await run(['deploy']);
 if(typeof secret==='string'&&secret.trim())await run(['secret','put','GITHUB_CLIENT_SECRET'],secret.trim()+'\n');
}

async function main(){
 const here=path.dirname(fileURLToPath(import.meta.url));
 const candidates=[path.resolve('node_modules/wrangler/bin/wrangler.js'),path.join(here,'node_modules/wrangler/bin/wrangler.js'),path.join(here,'../node_modules/wrangler/bin/wrangler.js')];
 const bin=candidates.find(p=>existsSync(p));
 if(!bin)throw Error('Install project dependencies before deploying.');
 const run=(args,input)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[bin,...args],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Cloudflare deployment command failed.')));
  child.stdin.on('error',()=>{});child.stdin.end(input||'');
 });
 await deployWithSecret(run,process.env.GITHUB_CLIENT_SECRET);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Deployment failed. Check Cloudflare build status; secret values are not logged by this script.');process.exitCode=1;});
