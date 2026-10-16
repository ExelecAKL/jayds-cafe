import assert from "node:assert/strict";
import test from "node:test";
import { withRequestDeadline } from "../packages/shared/src/utils/request.ts";
test("a stalled session wait times out even before a network request starts",async()=>{
 let requestSignal:AbortSignal|undefined;
 await assert.rejects(withRequestDeadline(signal=>{requestSignal=signal;return new Promise(()=>{});},20),{name:"RequestTimeoutError"});
 assert.equal(requestSignal?.aborted,true);
});
test("completed reads return their result and release the operation signal",async()=>{
 let requestSignal:AbortSignal|undefined;
 const data=await withRequestDeadline(async signal=>{requestSignal=signal;return {id:"fixture",role:"admin"};},100);
 assert.equal(data.id,"fixture");assert.equal(requestSignal?.aborted,true);
});
test("late old reads cannot replace the result of a retry",async()=>{
 let finish:(value:string)=>void=()=>{};
 const old=withRequestDeadline(()=>new Promise<string>(resolve=>finish=resolve),20);
 await assert.rejects(old,/taking too long/);
 const retry=await withRequestDeadline(async()=>"current",100);
 finish("stale");assert.equal(retry,"current");
});
test("synchronous and asynchronous failures retain their original error",async()=>{
 const reason=new Error("Fixture read denied");
 await assert.rejects(withRequestDeadline(()=>{throw reason;}),error=>error===reason);
 await assert.rejects(withRequestDeadline(async()=>{throw reason;}),error=>error===reason);
});
