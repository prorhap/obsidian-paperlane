import { test } from "node:test";
import assert from "node:assert/strict";
import { InstapaperClient } from "../src/client";
import { SendCoordinator } from "../src/workflow";
import { convert } from "../src/converter";
import type { Job } from "../src/types";

const article = () => convert({path:"a.md",format:"md",text:"# 시험\n\n본문입니다."});
function harness(options: { failParse?: boolean; failSave?: number; lose?: boolean; account?: number } = {}) {
  let saves = 0, body = "";
  const jobs: Job[] = [];
  const client = new InstapaperClient(async (path, method, input) => {
    if (path === "/me") return {status:200,json:{id:options.account || 1,username:"test@example.com",premium:false}};
    if (path === "/folders") return {status:200,json:{folders:[{id:2,title:"개인",public:false},{id:3,title:"공개",public:true}]}};
    if (path === "/bookmarks" && method === "POST") {
      saves++; body = (input as {content:string}).content;
      if (options.lose) throw new Error("network loss");
      return {status:options.failSave || 200,json:{id:10}};
    }
    if (path.endsWith("/parse")) return {status:options.failParse ? 400 : 200,json:{content:{body}}};
    if (path.startsWith("/bookmarks?")) return {status:200,json:{bookmarks:[],deleted_ids:[],total:0}};
    throw new Error(`Unexpected request ${path}`);
  });
  const journal = {jobs,flush:async () => {}};
  return { client, journal, get saves() {return saves;} };
}
test("Saves private HTML without URL; validates free account", async () => {
  let payload: Record<string, unknown> | undefined;
  const c = new InstapaperClient(async (_p,_m,input) => { payload=input as Record<string,unknown>; return {status:200,json:{id:1}}; });
  await c.save(await article(),"job",2);
  assert.equal(payload!.private_source,"Obsidian"); assert(!("url" in payload!));
  assert.equal(payload!.folder_id,2); assert(String(payload!.description).includes("[s2r:job]"));
});
test("Success records ID and body verification; repeat does not upload again", async () => {
  const h=harness(), c=new SendCoordinator(h.journal), a=await article();
  const j=await c.send(h.client,1,"a.md",a);
  assert.equal(j.status,"verified"); assert.equal(j.bookmarkId,10);
  assert.equal((await c.send(h.client,1,"a.md",a)).id,j.id); assert.equal(h.saves,1);
});
test("Parse failure retains saved ID and does not resend", async () => {
  const h=harness({failParse:true}),c=new SendCoordinator(h.journal),a=await article();
  const j=await c.send(h.client,1,"a.md",a);
  assert.equal(j.status,"warning"); assert.equal(j.bookmarkId,10);
  await c.send(h.client,1,"a.md",a); assert.equal(h.saves,1);
});
test("Uncertain save requires reconciliation and prevents duplicate POST", async () => {
  const h=harness({lose:true}),c=new SendCoordinator(h.journal),a=await article();
  const j=await c.send(h.client,1,"a.md",a); assert.equal(j.status,"unknown");
  await assert.rejects(c.send(h.client,1,"a.md",a),/결과가 불명확/); assert.equal(h.saves,1);
  await c.reconcile(h.client,j); assert.equal(j.status,"unknown");
});
test("Definitive 401 does not become a success or automatic retry", async () => {
  const h=harness({failSave:401}),c=new SendCoordinator(h.journal);
  const j=await c.send(h.client,1,"a.md",await article());
  assert.equal(j.status,"failed"); assert.equal(h.saves,1);
});
test("Journal failure before POST prevents network mutation", async () => {
  const h=harness();
  const c=new SendCoordinator({jobs:h.journal.jobs,flush:async()=>{throw new Error("disk");}});
  await assert.rejects(c.send(h.client,1,"a.md",await article()),/disk/);
  assert.equal(h.saves,0);
});
test("Account mismatch blocks before POST", async () => {
  const h=harness({account:2}),c=new SendCoordinator(h.journal);
  await assert.rejects(c.send(h.client,1,"a.md",await article()),/계정이 변경/);
  assert.equal(h.saves,0);
});
test("Public or missing folder is rejected before saving", async () => {
  const h=harness(),c=new SendCoordinator(h.journal);
  await assert.rejects(c.send(h.client,1,"a.md",await article(),3),/비공개/);
  assert.equal(h.saves,0);
});
test("Changed content creates a new snapshot without deleting prior one", async () => {
  const h=harness(),c=new SendCoordinator(h.journal),a=await article();
  await c.send(h.client,1,"a.md",a);
  await c.send(h.client,1,"a.md",{...a,title:"새 제목"});
  assert.equal(h.saves,2);assert.equal(h.journal.jobs.length,2);
});
test("Recovery counts deleted IDs in pagination and finds exact job marker", async () => {
  const paths:string[]=[];
  const c=new InstapaperClient(async p=>{
    paths.push(p);
    if(p.includes("offset=0"))return {status:200,json:{bookmarks:[],deleted_ids:Array.from({length:100},(_,i)=>i)}};
    return {status:200,json:{bookmarks:[{id:44,description:"[s2r:abcd]"}],deleted_ids:[]}};
  });
  const found=await c.findJob("abcd",1000000);
  assert.equal(found[0]!.id,44);assert(paths[1]!.includes("offset=100"));
});
test("Late response after UI timeout records original ID, no second upload", async () => {
  const jobs:Job[]=[];let resolveSave:(v:{status:number;json:unknown})=>void=()=>{};
  const c=new InstapaperClient(async (p)=>{
    if(p==="/me")return {status:200,json:{id:1,username:"test",premium:false}};
    return new Promise(r=>{resolveSave=r;});
  });
  const w=new SendCoordinator({jobs,flush:async()=>{}},5);
  const job=await w.send(c,1,"a.md",await article());assert.equal(job.status,"unknown");
  resolveSave({status:200,json:{id:77}});
  await new Promise(r=>setTimeout(r,10));
  assert.equal(job.bookmarkId,77);assert.equal(job.status,"saved");
});
