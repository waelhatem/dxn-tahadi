// V86.73 — YouTube link parsing for «🎓 أكاديمية المنصة». Accepts only
// youtube.com/watch?v=<id> (www., m. or bare host) and youtu.be/<id>; anything else is
// rejected. app/academy.js carries the same rules for the leader's pre-check; the
// server is the authority.
const YOUTUBE_ID_PATTERN=/^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com']);
const SHORT_HOSTS=new Set(['youtu.be','www.youtu.be']);
const MAX_URL_LENGTH=500;

function parseYouTubeId(input){
  const raw=String(input==null?'':input).trim();
  if(!raw||raw.length>MAX_URL_LENGTH)return '';
  let url;
  try{url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw);}catch(_){return '';}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return '';
  const host=url.hostname.toLowerCase();
  let id='';
  if(WATCH_HOSTS.has(host)&&url.pathname==='/watch')id=url.searchParams.get('v')||'';
  else if(SHORT_HOSTS.has(host))id=url.pathname.replace(/^\/+/,'').split('/')[0];
  return YOUTUBE_ID_PATTERN.test(id)?id:'';
}

function canonicalYouTubeUrl(id){
  if(!YOUTUBE_ID_PATTERN.test(String(id||'')))throw new Error('invalid YouTube id');
  return 'https://www.youtube.com/watch?v='+id;
}

module.exports={parseYouTubeId,canonicalYouTubeUrl,YOUTUBE_ID_PATTERN};
