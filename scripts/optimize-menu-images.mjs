import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// Explicit --apply is required for uploads/links. Originals and prior URLs remain.
const apply=process.argv.includes('--apply');
const env=Object.fromEntries(readFileSync('apps/customer/.env.local','utf8').split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z0-9_]+)=(.*)$/);return m?[[m[1],m[2].replace(/^(["'])(.*)\1$/,'$2')]]:[]}));
const origin=new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
const db=createClient(origin,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='jayds-menu-images', directory='.codex-logs/optimized-menu';mkdirSync(directory,{recursive:true});
const manifest=JSON.parse(readFileSync('assets/menu-products/manifest.json','utf8'));
const result=await db.from('menu_items').select('id,name,image_url').order('id');if(result.error)throw Error('Menu read failed');
const rows=result.data.filter(row=>manifest.items.some(item=>item.id===row.id));
const backup=`${directory}/before-links.json`;
if(!existsSync(backup))writeFileSync(backup,JSON.stringify({at:new Date().toISOString(),rows},null,2));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const prepared=[];let next=0;
await Promise.all(Array.from({length:3},async()=>{
 while(next<rows.length){
  const row=rows[next++],url=new URL(row.image_url);
  // Never rewrite an operator photo, arbitrary remote URL, or already-optimized family.
  if(url.origin!==origin||!new RegExp(`^/storage/v1/object/public/${bucket}/generated/${row.id}/[a-z0-9-]+\\.png$`).test(url.pathname))continue;
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.ok(response.ok,`Original unavailable: ${row.name}`);
  const original=Buffer.from(await response.arrayBuffer());assert.ok(original.length<=5*1024*1024);
  const info=await sharp(original).metadata();assert.equal(info.format,'png');
  const slug=manifest.items.find(item=>item.id===row.id).slug;
  const fingerprint=hash(original).slice(0,12);
  const variants=[];
  for(const width of [320,640]){
   const bytes=await sharp(original).resize({width,height:width,fit:'inside',withoutEnlargement:true}).webp({quality:80,alphaQuality:100,effort:5}).toBuffer();
   const metadata=await sharp(bytes).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.hasAlpha,info.hasAlpha);assert.ok(bytes.length<original.length);
   const path=`generated/${row.id}/${slug}-${fingerprint}-${width}.webp`;
   writeFileSync(`${directory}/${slug}-${width}.webp`,bytes);
   if(apply){
    const uploaded=await db.storage.from(bucket).upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
    if(uploaded.error&&!/already exists/i.test(uploaded.error.message))throw Error(`Upload failed: ${row.name}`);
    const verify=await fetch(db.storage.from(bucket).getPublicUrl(path).data.publicUrl,{signal:AbortSignal.timeout(20000)});
    assert.ok(verify.ok);assert.match(verify.headers.get('content-type')||'',/image\/webp/);assert.equal(hash(Buffer.from(await verify.arrayBuffer())),hash(bytes));
   }
   variants.push({width,bytes:bytes.length,path,sha256:hash(bytes)});
  }
  prepared.push({id:row.id,name:row.name,previous:row.image_url,originalBytes:original.length,variants,url:db.storage.from(bucket).getPublicUrl(variants[1].path).data.publicUrl});
 }
}));
// Upload and verify every object before changing any catalog links.
if(apply)for(const row of prepared){
 const updated=await db.from('menu_items').update({image_url:row.url}).eq('id',row.id).eq('image_url',row.previous).select('id');
 assert.equal(updated.error,null);assert.equal(updated.data.length,1,`Image changed while preparing: ${row.name}`);
}
const originalBytes=prepared.reduce((sum,row)=>sum+row.originalBytes,0),cardBytes=prepared.reduce((sum,row)=>sum+row.variants[0].bytes,0),detailBytes=prepared.reduce((sum,row)=>sum+row.variants[1].bytes,0);
const report={status:'PASS',mode:apply?'applied':'prepared only',at:new Date().toISOString(),products:prepared.length,originalBytes,cardBytes,detailBytes,cardReductionPercent:Number((100*(1-cardBytes/originalBytes)).toFixed(2)),detailReductionPercent:Number((100*(1-detailBytes/originalBytes)).toFixed(2)),originalsPreserved:true,stockAndOrderWrites:false,items:prepared};
writeFileSync(`${directory}/${apply?'applied':'prepared'}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,items:undefined}));
