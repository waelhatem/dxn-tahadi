'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const api=require('../api/academy-video-storage.js');
const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261019093000_academy_leader_videos.sql'),'utf8');
const academy=fs.readFileSync(path.join(ROOT,'app/academy.js'),'utf8');
const enhanced=fs.readFileSync(path.join(ROOT,'app/academy-leader-videos.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'app/index.html'),'utf8');

const token='11111111-1111-4111-8111-111111111111';
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function res(){
  return {code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},
    status(code){this.code=code;return this},json(value){this.body=value;return this}};
}
function fakeHttp(payload,status=200){
  return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(payload)}};
}
function withEnv(env,fn){
  const old={};
  for(const [k,v] of Object.entries(env)){old[k]=process.env[k];process.env[k]=v}
  return Promise.resolve().then(fn).finally(()=>{for(const [k,v] of Object.entries(old)){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }});
}
test('legacy three guide videos and academy page are preserved',()=>{
  assert.match(academy,/academy-intro-community/);
  assert.match(academy,/academy-main-interface/);
  assert.match(academy,/academy-new-visitor/);
  assert.match(academy,/window\.academyPage=function/);
  assert.match(enhanced,/شروحات القائد/);
  assert.match(enhanced,/دليل استخدام المجتمع/);
  assert.match(enhanced,/academyLeaderVideoList/);
  assert.match(index,/academy-leader-videos\.js/);
});
test('publishing is atomic: storage object checked, announcement created with linked video',()=>{
  assert.match(sql,/academy_leader_video_publish/);
  assert.match(sql,/storage\.objects/);
  assert.match(sql,/v_size is distinct from p_file_size/);
  assert.match(sql,/insert into public\.global_announcements/);
  assert.match(sql,/source,video_id/);
  assert.match(sql,/values\('🎬 شرح جديد:/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.academy_leader_videos from public,anon,authenticated/);
});
test('old broadcasts excluded for new registered members across video, daily and manual',()=>{
  assert.match(sql,/a\.created_at>=registered_at/);
  assert.match(sql,/from public\.app_users u where u\.id=uid/);
  assert.match(sql,/a\.source in\('manual','video'\)/);
  assert.match(sql,/a\.source='daily_ai'/);
  assert.match(sql,/not exists\(select 1 from public\.global_announcement_reads/);
  assert.match(index,/item\.source==='video'/);
  assert.match(index,/__DXN_GA_WATCH__/);
  assert.match(index,/academyOpenLeaderVideo\(item\.video_id\)/);
});
test('unsigned visitor cannot request upload or signed playback',async()=>{
  const r=res();await api({method:'POST',body:{action:'play',p_token:'invalid',video_id:token}},r);
  assert.equal(r.code,401);
  const method=res();await api({method:'GET',body:{}},method);
  assert.equal(method.code,405);
});
test('member cannot upload; leader gets short-lived signed upload token, not secret',async()=>{
  const oldFetch=global.fetch;
  let currentRole='member';
  const paths=[];
  global.fetch=async(url)=>{
    paths.push(url);
    if(url.endsWith('/rpc/bootstrap'))return fakeHttp({user_id:userId,role:currentRole});
    if(url.includes('/object/upload/sign/'))return fakeHttp({token:'storage-only-upload-token'});
    throw Error('unexpected route '+url);
  };
  try{
    await withEnv({SUPABASE_SECRET_KEY:'fake-secret-role'},async()=>{
      const member=res();
      await api({method:'POST',body:{action:'prepare',p_token:token,content_type:'video/mp4',file_size:500}},member);
      assert.equal(member.code,403);
      assert.equal(paths.length,1);
      currentRole='leader';
      const leader=res();
      await api({method:'POST',body:{action:'prepare',p_token:token,content_type:'video/mp4',file_size:500}},leader);
      assert.equal(leader.code,200);
      assert.equal(leader.body.upload_token,'storage-only-upload-token');
      assert.match(leader.body.path,new RegExp('^leader/'+userId+'/[a-f0-9-]+\\.mp4$'));
      assert.doesNotMatch(JSON.stringify(leader.body),/fake-secret-role/);
    });
  }finally{global.fetch=oldFetch}
});
test('members get only a timed signed playable URL for an existing published video',async()=>{
  const oldFetch=global.fetch,seen=[];
  global.fetch=async(url)=>{
    seen.push(url);
    if(url.endsWith('/rpc/bootstrap'))return fakeHttp({user_id:userId,role:'member'});
    if(url.includes('/rest/v1/academy_leader_videos?'))return fakeHttp([{object_path:'leader/'+userId+'/'+token+'.mp4'}]);
    if(url.includes('/object/sign/'))return fakeHttp({signedURL:'/object/sign/platform-academy/path.mp4?token=play-token'});
    throw Error('unexpected '+url);
  };
  try{
    await withEnv({SUPABASE_SECRET_KEY:'fake-secret-role'},async()=>{
      const r=res();await api({method:'POST',body:{action:'play',p_token:token,video_id:token}},r);
      assert.equal(r.code,200);
      assert.equal(r.body.expires_in,3600);
      assert.equal(r.body.url,'https://ryqpstkzppaifpvhezzn.supabase.co/storage/v1/object/sign/platform-academy/path.mp4?token=play-token');
      assert.equal(seen.length,3);
    });
  }finally{global.fetch=oldFetch}
});
test('upload has 50 MB limit and front end sends file directly via signed token',()=>{
  assert.equal(api.__test.MAX_VIDEO,50*1024*1024);
  assert.match(enhanced,/uploadToSignedUrl\(/);
  assert.match(enhanced,/MAX_BYTES=50\*1024\*1024/);
  assert.match(enhanced,/academy_leader_video_publish/);
  assert.match(enhanced,/action:'prepare'/);
  assert.match(enhanced,/action:'play'/);
  assert.match(fs.readFileSync(path.join(ROOT,'server.js'),'utf8'),/\/api\/academy-video-storage/);
});


test('all leader video thumbnails use one static 16:9 artwork with their own safe title',()=>{
  const cover=fs.readFileSync(path.join(ROOT,'academy-leader-photo.avif'));
  assert.ok(cover.length>9000);
  assert.equal(cover.subarray(4,8).toString(),'ftyp');
  assert.match(enhanced,/const COVER_SRC='\/academy-leader-photo\.avif'/);
  assert.match(enhanced,/function coverElement\(videoTitle\)/);
  assert.match(enhanced,/elem\('strong','academy-leader-cover-title',videoTitle\)/);
  assert.match(enhanced,/button\.append\(coverElement\(v\.title\)\)/);
  assert.match(enhanced,/titleInput\?\.addEventListener\('input'/);
  assert.match(enhanced,/art\.querySelector\('\.academy-leader-cover-title'\)\.textContent=text/);
  assert.match(enhanced,/academy-leader-stage-cover/);
  assert.match(enhanced,/aspect-ratio:9\/16/);
  assert.match(enhanced,/font-weight:950/);
  assert.doesNotMatch(enhanced,/ffmpeg|canvas\.toBlob|extractFrame|transcod/i);
});

test('preview runs on the same deployed app and reuses the uploaded portrait',()=>{
  const preview=fs.readFileSync(path.join(ROOT,'academy-cover-preview.html'),'utf8');
  assert.match(preview,/data:image\/avif;base64,/);
  assert.match(preview,/شروحات القائد/);
  assert.match(preview,/الموبايل/);
  assert.match(preview,/اللابتوب/);
  assert.ok(enhanced.includes('href="/academy-cover-preview.html"'));
});

test('choosing a video previews its real local recording before writing title and publishing',()=>{
  const filePicker=enhanced.indexOf('id="academyLeaderVideoFile"');
  const preview=enhanced.indexOf('id="academyLeaderLocalPlayer"');
  const title=enhanced.indexOf('id="academyLeaderVideoTitle"');
  const submit=enhanced.indexOf('id="academyLeaderPublishButton"');
  assert.ok(filePicker>=0&&preview>filePicker&&title>preview&&submit>title);
  assert.match(enhanced,/function academyPreviewSelectedFile\(\)/);
  assert.match(enhanced,/URL\.createObjectURL\(file\)/);
  assert.match(enhanced,/URL\.revokeObjectURL\(localVideoPreviewUrl\)/);
  assert.match(enhanced,/academyLeaderVideoFile'\)\?\.addEventListener\('change',academyPreviewSelectedFile\)/);
  assert.match(enhanced,/controls playsinline preload="metadata"/);
  assert.match(enhanced,/id="academyLeaderMetaFields"[^>]*hidden/);
  assert.match(enhanced,/id="academyLeaderPublishButton" disabled/);
  assert.match(enhanced,/if\(!localVideoPreviewUrl\)/);
  assert.match(enhanced,/function mount\(\)[\s\S]*?if\(activeRoot\)academyClearLocalPreview\(\)/);
  assert.match(enhanced,/academy-leader-local-preview\[hidden\]/);
  assert.match(enhanced,/academy-leader-meta-fields\[hidden\]/);
  assert.ok(filePicker<enhanced.indexOf('function academyPreviewSelectedFile()'),'select file appears in publisher form before preview handler');
  assert.doesNotMatch(enhanced.slice(enhanced.indexOf('function academyPreviewSelectedFile()'),enhanced.indexOf('async function uploadVideo()')),/uploadToSignedUrl|academy_leader_video_publish/);
});


test('video notices show a distinct watch action and suppress popups during direct playback',()=>{
 const src=fs.readFileSync(path.join(ROOT,'app/index.html'),'utf8');
 assert.match(src,/ga-video-announcement/);
 assert.match(src,/🎬 فيديو تعليمي جديد في الأكاديمية/);
 assert.match(src,/ga-video-watch-btn/);
 assert.match(src,/مشاهدة الفيديو الآن/);
 assert.match(src,/videoWatchPausedSession=sessionAtClick/);
 assert.match(src,/closeMemberModal\(\);\s*try\{\s*window\.academyOpenLeaderVideo\(item\.video_id\)/);
 assert.match(src,/videoWatchPausedSession===tokenValue\(\)/);
 assert.match(src,/gaRpc\('acknowledge_global_announcement'/);
 assert.match(enhanced,/if\(videos\.some\(v=>v\.id===id\)\)await selectVideo\(id\)/);
});


test('video announcement button opens exactly the linked video without a follow-on popup',async()=>{
  const vm=require('node:vm');
  const indexHtml=fs.readFileSync(path.join(ROOT,'app/index.html'),'utf8');
  const match=indexHtml.match(/<script id="dxn-global-announcements-v1-script">([\s\S]*?)<\/script>/);
  assert.ok(match,'global announcement module exists');
  const noticeId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const videoId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const elems=Object.create(null), queued=[],opened=[],acknowledged=[];
  let listCalls=0,observerCallback;
  let session='session-1';
  const body={
    appendChild(node){node.parentNode=body;elems[node.id]=node;},
    removeChild(node){if(elems[node.id]===node)delete elems[node.id];node.parentNode=null;}
  };
  const ctx={
    window:{
      academyOpenLeaderVideo(id){opened.push(id);}
    },
    role:'member',tab:'home',
    console,toast(){},
    localStorage:{getItem(k){return k==='dxn_session'?session:null}},
    document:{
      readyState:'complete',body,
      createElement(){return {id:'',className:'',innerHTML:'',parentNode:null}},
      getElementById(id){return elems[id]||null}
    },
    MutationObserver:class {
      constructor(fn){observerCallback=fn}
      observe(){}
    },
    setTimeout(fn){queued.push(fn)},
    fetch:async (_url,options)=>{
      const {fn,args}=JSON.parse(options.body);
      let result;
      if(fn==='list_global_announcements_for_member'){
        listCalls++;
        result=[{id:noticeId,title:'🎬 شرح جديد: شرح تسجيل العضو',body:'موضوع الفيديو: تسجيل العضو',
          source:'video',video_id:videoId,announcement_type:'announcement'}];
      }else if(fn==='acknowledge_global_announcement'){
        acknowledged.push(args.p_announcement_id);
        result=true;
      }else throw Error('unexpected '+fn);
      return {ok:true,status:200,text:async()=>JSON.stringify(result)};
    }
  };
  vm.runInNewContext(match[1],ctx,{timeout:1500});
  assert.equal(queued.length,1);
  await queued.shift()();
  await new Promise(resolve=>setImmediate(resolve));
  const modal=elems.dxnGlobalAnnouncementModal;
  assert.ok(modal,'member popup opened on login');
  assert.match(modal.innerHTML,/🎬 فيديو تعليمي جديد في الأكاديمية/);
  assert.match(modal.innerHTML,/شرح تسجيل العضو/);
  assert.match(modal.innerHTML,/موضوع الفيديو/);
  assert.match(modal.innerHTML,/▶ مشاهدة الفيديو الآن/);
  ctx.window.__DXN_GA_WATCH__();
  assert.deepEqual(opened,[videoId]);
  assert.equal(elems.dxnGlobalAnnouncementModal,undefined,'modal closes before navigation');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(acknowledged,[noticeId]);
  const oldCalls=listCalls;
  observerCallback();
  assert.equal(queued.length,1);
  await queued.shift()();
  assert.equal(listCalls,oldCalls,'other announcements stay paused during playback');
  assert.equal(elems.dxnGlobalAnnouncementModal,undefined);
});
