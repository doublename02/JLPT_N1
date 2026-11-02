import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deployWithSecret} from '../deploy.mjs';
test('build secret is forwarded to the runtime over stdin, never command arguments',async()=>{
 const calls=[];await deployWithSecret(async(args,input)=>calls.push({args,input}),'test-only-secret');
 assert.deepEqual(calls[0].args,['deploy']);assert.deepEqual(calls[1].args,['secret','put','GITHUB_CLIENT_SECRET']);
 assert.equal(calls[1].input,'test-only-secret\n');assert(!JSON.stringify(calls.map(c=>c.args)).includes('test-only-secret'));
});
test('an absent build secret preserves an existing runtime secret',async()=>{
 const calls=[];await deployWithSecret(async(args)=>calls.push(args),undefined);assert.deepEqual(calls,[['deploy']]);
});
test('failed code deployment never updates runtime bindings',async()=>{
 let calls=0;await assert.rejects(deployWithSecret(async()=>{calls++;throw Error('failed');},'test-only-secret'));assert.equal(calls,1);
});
