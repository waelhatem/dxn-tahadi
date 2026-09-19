/* AI Agent Chat — additive UI only. Does not replace or modify existing application views. */
(function(){
  if(window.__DXN_AI_AGENT_CHAT_V1__) return;
  window.__DXN_AI_AGENT_CHAT_V1__=true;

  const STYLE=`
  #dxnAgentLauncher{position:fixed;left:18px;bottom:78px;z-index:2147483000;width:56px;height:56px;border-radius:50%;background:#fff;color:#0f513f;border:2px solid #0f513f;box-shadow:0 8px 24px #0003;font-size:25px;font-weight:900;cursor:pointer}
  #dxnAgentPanel{position:fixed;left:18px;bottom:145px;z-index:2147483001;width:min(420px,calc(100vw - 36px));height:min(620px,calc(100vh - 175px));background:#fff;border:1px solid #dce8e3;border-radius:22px;box-shadow:0 18px 55px #0004;display:none;overflow:hidden;direction:rtl}
  #dxnAgentPanel.show{display:flex;flex-direction:column}
  .dxn-agent-head{background:linear-gradient(135deg,#0c4738,#1a725b);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .dxn-agent-head-actions{display:flex;align-items:center;gap:6px}
  .dxn-agent-push{background:#ffffff20!important;color:#fff!important;border:1px solid #ffffff55!important;min-height:36px!important;padding:7px 9px!important;font-size:15px!important}
  .dxn-agent-push.enabled{background:#dff7e8!important;color:#0f513f!important;border-color:#dff7e8!important}
  .dxn-agent-head b{font-size:17px}.dxn-agent-head small{display:block;opacity:.85;margin-top:2px}
  .dxn-agent-close{background:#ffffff20!important;color:#fff!important;border:1px solid #ffffff55!important;min-height:36px!important;padding:7px 11px!important}
  #dxnAgentMessages{flex:1;overflow:auto;padding:14px;background:#f5f9f7}
  .dxn-agent-msg{max-width:88%;padding:10px 12px;border-radius:15px;margin:7px 0;white-space:pre-wrap;line-height:1.7;font-size:14px}
  .dxn-agent-user{margin-right:auto;background:#0f513f;color:#fff;border-bottom-left-radius:5px}
  .dxn-agent-ai{margin-left:auto;background:#fff;color:#18352c;border:1px solid #dce8e3;border-bottom-right-radius:5px}
  .dxn-agent-status{font-size:12px;color:#66756f;padding:5px 12px;min-height:24px}
  .dxn-agent-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8e5;background:#fff;align-items:flex-end}
  .dxn-agent-mic{width:48px;min-width:48px;height:46px;background:#fff;color:#0f513f;border:2px solid #0f513f;border-radius:12px;font-size:21px;cursor:pointer}
  .dxn-agent-mic.recording{background:#b42318;color:#fff;border-color:#b42318;animation:dxnAgentPulse 1s infinite}
  @keyframes dxnAgentPulse{50%{box-shadow:0 0 0 6px #b4231830}}
  #dxnAgentInput{flex:1;resize:none;min-height:46px;max-height:120px;margin:0!important}
  #dxnAgentSend{min-width:78px;background:#0f513f;color:#fff}
  @media(max-width:560px){#dxnAgentLauncher{left:14px;bottom:76px}#dxnAgentPanel{left:10px;bottom:140px;width:calc(100vw - 20px);height:min(650px,calc(100vh - 160px))}}
  `;
  function el(tag,attrs,html){
    const x=document.createElement(tag);
    Object.entries(attrs||{}).forEach(([k,v])=>x.setAttribute(k,v));
    if(html!==undefined)x.innerHTML=html;
    return x;
  }
  function sessionToken(){return String(localStorage.getItem('dxn_session')||'').trim();}
  let audioContext=null;
  let currentSource=null;
  async function ensureAudioContext(){
    try{
      if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==='suspended')await audioContext.resume();
      return audioContext;
    }catch(_){return null;}
  }
  function addMsg(text,who){
    const box=document.getElementById('dxnAgentMessages');if(!box)return null;
    const d=el('div',{class:'dxn-agent-msg '+(who==='user'?'dxn-agent-user':'dxn-agent-ai')});
    d.textContent=text;box.appendChild(d);box.scrollTop=box.scrollHeight;return d;
  }

  async function speakAnswer(text){
    try{
      const token=sessionToken();if(!token||!text)return;
      const ctx=await ensureAudioContext();
      setStatus('جارٍ تشغيل صوت محمد...');
      const r=await fetch('/api/ai-agent-voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'speak',token,text})});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||('HTTP '+r.status));}
      const data=await r.arrayBuffer();
      if(ctx){
        const decoded=await ctx.decodeAudioData(data.slice(0));
        if(currentSource){try{currentSource.stop();}catch(_){}}
        currentSource=ctx.createBufferSource();
        currentSource.buffer=decoded;
        currentSource.connect(ctx.destination);
        currentSource.onended=()=>{currentSource=null;setStatus('');};
        if(ctx.state==='suspended')await ctx.resume();
        currentSource.start(0);
        return;
      }
      const blob=new Blob([data],{type:'audio/mpeg'});
      const url=URL.createObjectURL(blob);
      const audio=new Audio(url);audio.preload='auto';
      audio.onended=()=>{URL.revokeObjectURL(url);setStatus('');};
      await audio.play();
    }catch(e){
      setStatus('تعذر تشغيل صوت محمد تلقائيًا: '+String(e.message||e));
    }
  }
  async function send(messageOverride, fromVoice=false){
    const input=document.getElementById('dxnAgentInput');const message=String(messageOverride!==undefined?messageOverride:(input&&input.value)||'').trim();
    if(!message)return;
    const token=sessionToken();
    if(!token){addMsg('يرجى تسجيل الدخول أولًا حتى أتمكن من قراءة بيانات حسابك.','ai');return;}
    ensureAudioContext().catch(()=>{});
    addMsg(message,'user');input.value='';setStatus('جارٍ التفكير...');
    const history=[...document.querySelectorAll('#dxnAgentMessages .dxn-agent-msg')].slice(-14).map(x=>({
      role:x.classList.contains('dxn-agent-user')?'user':'assistant',content:x.textContent
    }));
    try{
      const r=await fetch('/api/ai-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,message,history})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      const answer=d.answer||'لم يصل رد من الوكيل.';
      addMsg(answer,'ai');
      if(fromVoice) await speakAnswer(answer);
    }catch(e){addMsg('تعذر الاتصال بالوكيل: '+String(e.message||e),'ai');setStatus('');}
  }
  let speechRecognition=null;
  let voiceBusy=false;
  let speechFinalText='';

  function setupVoice(){
    const mic=document.getElementById('dxnAgentMic');if(!mic)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){
      mic.title='التحدث الصوتي غير مدعوم في هذا المتصفح';
      mic.addEventListener('click',()=>addMsg('للتحدث مع محمد بالصوت، افتح المنصة في Chrome أو Edge ثم اسمح باستخدام الميكروفون.','ai'));
      return;
    }

    speechRecognition=new SR();
    speechRecognition.lang='ar-IQ';
    speechRecognition.continuous=true;
    speechRecognition.interimResults=true;
    speechRecognition.maxAlternatives=1;

    speechRecognition.onstart=()=>{
      voiceBusy=true;
      speechFinalText='';
      mic.classList.add('recording');
      mic.textContent='⏹️';
      setStatus('محمد يسمعك الآن... اضغط مرة ثانية عندما تخلص');
    };

    speechRecognition.onresult=event=>{
      let interim='';
      for(let i=event.resultIndex;i<event.results.length;i++){
        const text=String(event.results[i][0]?.transcript||'').trim();
        if(!text)continue;
        if(event.results[i].isFinal) speechFinalText+=' '+text;
        else interim+=' '+text;
      }
      const preview=(speechFinalText+' '+interim).trim();
      if(preview)setStatus('أسمعك: '+preview.slice(-120));
    };

    speechRecognition.onerror=event=>{
      const messages={
        'not-allowed':'اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.',
        'service-not-allowed':'خدمة التعرف على الصوت غير متاحة في المتصفح الحالي.',
        'no-speech':'لم أسمع كلامًا واضحًا. حاول مرة أخرى.',
        'audio-capture':'تعذر الوصول إلى الميكروفون.',
        'network':'تعذر الوصول إلى خدمة التعرف على الصوت.'
      };
      const msg=messages[event.error]||('تعذر التعرف على الصوت: '+event.error);
      addMsg(msg,'ai');
      setStatus('');
      voiceBusy=false;
      mic.classList.remove('recording');
      mic.textContent='🎙️';
    };

    speechRecognition.onend=async()=>{
      mic.classList.remove('recording');
      mic.textContent='🎙️';
      const text=speechFinalText.trim();
      speechFinalText='';
      voiceBusy=false;
      if(!text){setStatus('');return;}
      setStatus('جارٍ إرسال كلامك إلى محمد...');
      await send(text,true);
    };

    mic.addEventListener('click',()=>{
      if(voiceBusy){
        try{speechRecognition.stop();}catch(_){}
        return;
      }
      const token=sessionToken();
      if(!token){addMsg('يرجى تسجيل الدخول أولًا.','ai');return;}
      ensureAudioContext().then(()=>{
        try{speechRecognition.start();}
        catch(e){setStatus('تعذر بدء الميكروفون. حاول مرة أخرى.');}
      }).catch(()=>{
        try{speechRecognition.start();}
        catch(e){setStatus('تعذر بدء الميكروفون. حاول مرة أخرى.');}
      });
    });
  }

  let dailyBootstrapStarted=false;
  let dailyHeartbeatTimer=null;

  function base64UrlToUint8Array(base64String){
    const padding='='.repeat((4-(base64String.length%4))%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
  }

  async function pushApi(body){
    const r=await fetch('/api/push',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
    return d;
  }

  async function testCurrentMemberFollowup(){
    const token=sessionToken();
    const btn=document.getElementById('dxnAgentPush');
    if(!token||!btn)return;
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub){
        addMsg('فعّل إشعارات محمد أولًا ثم اختبر المتابعة.','ai');
        return;
      }
      setStatus('محمد يختبر المتابعة الخلفية...');
      const r=await pushApi({
        action:'test_followup',
        token,
        subscription:sub.toJSON()
      });
      addMsg(r.message||'تم إرسال اختبار المتابعة.','ai');
    }catch(e){
      addMsg('تعذر اختبار المتابعة: '+String(e.message||e),'ai');
    }finally{
      setStatus('');
    }
  }

  async function subscribePushNotifications(){
    const token=sessionToken();
    if(!token){
      addMsg('يرجى تسجيل الدخول أولًا حتى نفعّل إشعارات محمد.','ai');
      return;
    }

    const existingEnabled=!!document.getElementById('dxnAgentPush')?.classList.contains('enabled');
    if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)){
      addMsg('هذا المتصفح لا يدعم إشعارات Push المطلوبة. استخدم Chrome أو Edge أو Safari حديثًا.','ai');
      return;
    }

    const btn=document.getElementById('dxnAgentPush');
    try{
      if(Notification.permission==='denied'){
        throw new Error('إشعارات المتصفح مرفوضة. فعّلها من إعدادات المتصفح ثم حاول مرة أخرى.');
      }
      const permission=Notification.permission==='granted'
        ? 'granted'
        : await Notification.requestPermission();
      if(permission!=='granted')throw new Error('لم يتم السماح بإشعارات محمد.');

      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();

      if(!subscription){
        const keyData=await pushApi({action:'public_key'});
        if(!keyData.publicKey)throw new Error('مفتاح Push العام غير مضبوط.');
        subscription=await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:base64UrlToUint8Array(keyData.publicKey)
        });
      }

      const json=subscription.toJSON();
      await pushApi({
        action:'subscribe',
        token,
        subscription:json,
        userAgent:navigator.userAgent
      });

      await pushApi({
        action:'test',
        token,
        subscription:json
      });

      if(btn){
        btn.classList.add('enabled');
        btn.textContent='🔔 مفعّلة';
        btn.title='إشعارات محمد مفعّلة — اضغط مرة أخرى لاختبار الخلفية';
      }
      addMsg('تم تفعيل إشعارات محمد الدائمة. أرسلت لك إشعار اختبار للتأكد من أن الجهاز يستقبله.','ai');
    }catch(e){
      addMsg('تعذر تفعيل إشعارات محمد: '+String(e.message||e),'ai');
    }
  }



  function showAgentNotification(text){
    try{
      if(!('Notification' in window)||Notification.permission!=='granted'||!text)return false;
      const n=new Notification('محمد — متابعة اليوم',{body:String(text).slice(0,180),icon:'/logo.png'});
      n.onclick=()=>{window.focus();document.getElementById('dxnAgentPanel')?.classList.add('show');};
      return true;
    }catch(_){return false;}
  }

  async function startDailyBootstrap({notify=false}={}){
    const token=sessionToken();
    if(!token)return null;
    try{
      setStatus('محمد يجهّز جلسة اليوم...');
      const r=await fetch('/api/ai-agent',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'daily_bootstrap',token})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      if(d.answer){
        const panel=document.getElementById('dxnAgentPanel');
        if(panel?.classList.contains('show') || !notify){
          addMsg(d.answer,'ai');
        }else{
          showAgentNotification(d.answer);
        }
      }
      setStatus('');
      return d;
    }catch(e){
      setStatus('');
      console.warn('Daily bootstrap failed:',e);
      return null;
    }
  }

  function startDailyHeartbeat(){
    if(dailyHeartbeatTimer)return;
    const run=()=>startDailyBootstrap({notify:true}).catch(()=>null);
    setTimeout(run,15000);
    dailyHeartbeatTimer=setInterval(run,15*60*1000);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')run();
    });
  }

  function mount(){
    if(document.getElementById('dxnAgentLauncher'))return;
    const style=el('style',{},STYLE);document.head.appendChild(style);
    const btn=el('button',{id:'dxnAgentLauncher',type:'button',title:'محمد'},'🤖');
    const panel=el('section',{id:'dxnAgentPanel','aria-label':'محادثة محمد'});
    panel.innerHTML='<div class="dxn-agent-head"><div><b>🤖 محمد</b><small>مدربك الذكي داخل المنصة</small></div><div class="dxn-agent-head-actions"><button id="dxnAgentPush" class="dxn-agent-push" type="button" title="تفعيل إشعارات محمد">🔔</button><button class="dxn-agent-close" type="button">إغلاق</button></div></div><div id="dxnAgentMessages"></div><div id="dxnAgentStatus" class="dxn-agent-status"></div><form class="dxn-agent-form"><button id="dxnAgentMic" class="dxn-agent-mic" type="button" title="تحدث مع الوكيل">🎙️</button><textarea id="dxnAgentInput" placeholder="اكتب سؤالك هنا... أو اضغط 🎙️ للتحدث" rows="1"></textarea><button id="dxnAgentSend" type="submit">إرسال</button></form>';
    document.body.append(btn,panel);
    btn.addEventListener('click',()=>{
      const opening=!panel.classList.contains('show');
      panel.classList.toggle('show');
      if(opening){
        document.getElementById('dxnAgentInput')?.focus();
        startDailyBootstrap({notify:false});
      }
    });
    panel.querySelector('.dxn-agent-close').addEventListener('click',()=>panel.classList.remove('show'));
    document.getElementById('dxnAgentPush').addEventListener('click',subscribePushNotifications);
    const pushBtn=document.getElementById('dxnAgentPush');
    pushBtn.addEventListener('contextmenu',e=>{
      e.preventDefault();
      testCurrentMemberFollowup().catch(()=>{});
    });
    panel.querySelector('form').addEventListener('submit',e=>{e.preventDefault();send();});
    document.getElementById('dxnAgentInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
    setupVoice();
    addMsg('مرحبًا، أنا محمد. يمكنك سؤالي عن تدريباتك وتقدمك وما يمكنك فعله الآن.','ai');
    startDailyHeartbeat();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();