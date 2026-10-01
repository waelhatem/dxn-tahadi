// R2 S3-compatible signing for academy uploads. No external dependencies.
// Uses AWS Signature V4 as documented by AWS. R2 uses the S3 API with region "auto".
const crypto=require('node:crypto');
const https=require('node:https');

const REGION='auto';
const SERVICE='s3';
const ALGORITHM='AWS4-HMAC-SHA256';
const MAX_EXPIRES=900;
const REQUEST_TIMEOUT_MS=15000;

function env(name){return String(process.env[name]||'').trim().replace(/[\r\n]/g,'');}
function config(){
  const accountId=env('R2_ACCOUNT_ID');
  const bucket=env('R2_BUCKET');
  const accessKeyId=env('R2_ACCESS_KEY_ID');
  const secretAccessKey=env('R2_SECRET_ACCESS_KEY');
  const publicBaseUrl=env('R2_PUBLIC_BASE_URL').replace(/\/$/,'');
  if(!accountId||!bucket||!accessKeyId||!secretAccessKey)throw new Error('R2 environment variables are not configured');
  if(!publicBaseUrl)throw new Error('R2_PUBLIC_BASE_URL is not configured');
  return {accountId,bucket,accessKeyId,secretAccessKey,publicBaseUrl};
}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function hmac(key,value,encoding){return crypto.createHmac('sha256',key).update(value).digest(encoding);}
function signingKey(secret,date,region=REGION,service=SERVICE){return hmac(hmac(hmac(hmac('AWS4'+secret,date),region),service),'aws4_request');}
function signatureForCanonicalRequest(secret,date,region,service,amzDate,canonicalRequest){
  const scope=date+'/'+region+'/'+service+'/aws4_request';
  const stringToSign=[ALGORITHM,amzDate,scope,sha256(canonicalRequest)].join('\\n');
  return hmac(signingKey(secret,date,region,service),stringToSign,'hex');
}
function awsEncode(value){return encodeURIComponent(String(value)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
function canonicalPath(key){
  return '/'+String(key).split('/').map(awsEncode).join('/');
}
function canonicalQuery(params){
  return Object.keys(params).sort().map(k=>awsEncode(k)+'='+awsEncode(params[k])).join('&');
}
function hostFor(c){return c.accountId+'.r2.cloudflarestorage.com';}
function objectUrl(c,key){return 'https://'+hostFor(c)+'/'+awsEncode(c.bucket)+'/'+canonicalPath(String(key).replace(/^\/+/, '').split('/').slice(0).join('/')).replace(/^\//,'/');}

function presignPut(key,contentType,expires=900,now=new Date()){
  const c=config();
  const ttl=Math.max(1,Math.min(MAX_EXPIRES,Number(expires)||900));
  const amzDate=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const date=amzDate.slice(0,8);
  const scope=date+'/'+REGION+'/'+SERVICE+'/aws4_request';
  const host=hostFor(c);
  const signedHeaders='content-type;host';
  const params={
    'X-Amz-Algorithm':ALGORITHM,
    'X-Amz-Credential':c.accessKeyId+'/'+scope,
    'X-Amz-Date':amzDate,
    'X-Amz-Expires':String(ttl),
    'X-Amz-SignedHeaders':signedHeaders
  };
  const headers='content-type:'+String(contentType).trim().toLowerCase()+'\nhost:'+host+'\n';
  const canonicalRequest=['PUT',canonicalPath(c.bucket+'/'+String(key).replace(/^\/+/,'')),canonicalQuery(params),headers,signedHeaders,'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign=[ALGORITHM,amzDate,scope,sha256(canonicalRequest)].join('\n');
  const signature=hmac(signingKey(c.secretAccessKey,date),stringToSign,'hex');
  params['X-Amz-Signature']=signature;
  const url='https://'+host+canonicalPath(c.bucket+'/'+String(key).replace(/^\/+/,''))+'?'+canonicalQuery(params);
  return {url,key,contentType:String(contentType).trim().toLowerCase(),expiresIn:ttl,publicUrl:c.publicBaseUrl+'/'+String(key).split('/').map(awsEncode).join('/')};
}

function signedHeaders(method,key,extraHeaders={},now=new Date()){
  const c=config();
  const amzDate=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const date=amzDate.slice(0,8);
  const scope=date+'/'+REGION+'/'+SERVICE+'/aws4_request';
  const host=hostFor(c);
  const headers={host,'x-amz-date':amzDate};
  for(const [k,v] of Object.entries(extraHeaders))headers[k.toLowerCase()]=String(v).trim();
  const signed=Object.keys(headers).sort();
  const canonicalHeaders=signed.map(k=>k+':'+headers[k]+'\n').join('');
  const path=canonicalPath(c.bucket+'/'+String(key).replace(/^\/+/,'')); 
  const canonicalRequest=[method,path,'',canonicalHeaders,signed.join(';'),'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign=[ALGORITHM,amzDate,scope,sha256(canonicalRequest)].join('\n');
  const signature=hmac(signingKey(c.secretAccessKey,date),stringToSign,'hex');
  headers.authorization=ALGORITHM+' Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed.join(';')+', Signature='+signature;
  return {headers,host,path};
}

function headObject(key){
  return new Promise((resolve,reject)=>{
    const c=config();
    const signed=signedHeaders('HEAD',key);
    const req=https.request({protocol:'https:',hostname:signed.host,method:'HEAD',path:signed.path,headers:signed.headers,timeout:REQUEST_TIMEOUT_MS},
      res=>{res.resume();res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,size:Number(res.headers['content-length']||0),contentType:String(res.headers['content-type']||'').toLowerCase()}));});
    req.on('timeout',()=>req.destroy(new Error('R2 HEAD request timed out')));
    req.on('error',reject);req.end();
  });
}

module.exports={presignPut,headObject,config,canonicalPath,canonicalQuery,sha256,signatureForCanonicalRequest};
