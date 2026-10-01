const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../api/academy-videos');
const {signatureForCanonicalRequest}=require('../api/_academy-r2');

const LEADER='11111111-1111-4111-8111-111111111111',MEMBER='22222222-2222-4222-8222-222222222222';

function fakeDb(){
  const calls=[];
  async function rpc(fn,args){
    calls.push({fn,args});
    if(![LEADER,MEMBER].includes(args.p_token))return {ok:false,status:400,data:{message:'انتهت الجلسة'}};
    if(fn==='list_academy_videos')return {ok:true,status:200,data:[{id:'a1',title:'المقدمة',section:'جولة',file_url:'https://cdn.example/a1.mp4',file_size:100,content_type:'video/mp4',sort_order:1}]};
    if(fn==='prepare_academy_video_upload'){
      if(args.p_token!==LEADER)return {ok:false,status:400,data:{message:'إضافة فيديو للأكاديمية متاحة للقائد فقط'}};
      return {ok:true,status:200,data:'33333333-3333-4333-8333-333333333333'};
    }
    if(fn==='get_academy_video_upload')return {ok:true,status:200,data:{id:args.p_video_id,object_key:'academy-videos/33333333-3333-4333-8333-333333333333',file_size:100,content_type:'video/mp4',status:'draft'}};
    if(fn==='complete_academy_video_upload')return {ok:true,status:200,data:[{id:args.p_video_id,title:'x',section:'',file_url:'https://cdn.example/x.mp4',file_size:args.p_file_size,content_type:args.p_content_type,sort_order:1}]};
    return {ok:false,status:404,data:{message:'unknown'}};
  }
  return {rpc,calls};
}
async function call(handler,{token,body,method='POST'}={}){
  const res={statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k.toLowerCase()]=v},end(v){this.body=v}};
  await handler({method,headers:token?{'x-dxn-session':token}:{},body:body||{}},res);
  return {status:res.statusCode,json:JSON.parse(res.body||'{}'),headers:res.headers};
}

test('members can list published R2 videos',async()=>{
  const db=fakeDb(),r=await call(createHandler({rpc:db.rpc}),{token:MEMBER,body:{action:'list'}});
  assert.equal(r.status,200);assert.equal(r.json.videos[0].file_url,'https://cdn.example/a1.mp4');
});

test('only leaders can prepare an upload',async()=>{
  const db=fakeDb(),presigner=(key,type)=>({url:'https://r2.example/upload',publicUrl:'https://cdn.example/'+key,contentType:type,expiresIn:900});
  const r=await call(createHandler({rpc:db.rpc,presigner}),{token:MEMBER,body:{action:'prepare',title:'x',file_size:100,content_type:'video/mp4'}});
  assert.equal(r.status,403);
  const ok=await call(createHandler({rpc:db.rpc,presigner}),{token:LEADER,body:{action:'prepare',title:'x',file_size:100,content_type:'video/mp4'}});
  assert.equal(ok.status,200);assert.match(ok.json.upload_url,/r2\.example/);
});

test('complete performs HEAD and refuses a wrong remote size',async()=>{
  const db=fakeDb(),head=async()=>({ok:true,status:200,size:99,contentType:'video/mp4'});
  const r=await call(createHandler({rpc:db.rpc,head}),{token:LEADER,body:{action:'complete',id:'33333333-3333-4333-8333-333333333333',file_size:100,content_type:'video/mp4'}});
  assert.equal(r.status,400);assert.match(r.json.error,/حجم الفيديو المرفوع/);
  assert.equal(db.calls.at(-1).fn,'get_academy_video_upload');
});

test('complete publishes only after matching HEAD',async()=>{
  const db=fakeDb(),head=async()=>({ok:true,status:200,size:100,contentType:'video/mp4'});
  const r=await call(createHandler({rpc:db.rpc,head}),{token:LEADER,body:{action:'complete',id:'33333333-3333-4333-8333-333333333333',file_size:100,content_type:'video/mp4'}});
  assert.equal(r.status,200);assert.equal(r.json.video.file_url,'https://cdn.example/x.mp4');
});

test('invalid file metadata is rejected before database',async()=>{
  for(const body of [{action:'prepare',title:'x',file_size:0,content_type:'video/mp4'},{action:'prepare',title:'x',file_size:100,content_type:'image/png'},{action:'prepare',title:'',file_size:100,content_type:'video/mp4'},{action:'prepare',title:'x',file_size:2147483649,content_type:'video/mp4'}]){
    const db=fakeDb(),r=await call(createHandler({rpc:db.rpc}),{token:LEADER,body});assert.equal(r.status,400);assert.equal(db.calls.length,0);
  }
});

test('AWS documented SigV4 example produces the documented signature',()=>{
  const canonicalRequest=[
    'GET','/test.txt',
    'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host',
    'host:examplebucket.s3.amazonaws.com\n','host','UNSIGNED-PAYLOAD'
  ].join('\n');
  const signature=signatureForCanonicalRequest('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY','20130524','us-east-1','s3','20130524T000000Z',canonicalRequest);
  assert.equal(signature,'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});
