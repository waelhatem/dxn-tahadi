/* AI Agent Chat — additive UI only. Does not replace or modify existing application views. */
(function(){
  if(window.__DXN_AI_AGENT_CHAT_V1__) return;
  window.__DXN_AI_AGENT_CHAT_V1__=true;

  const STYLE=`
  #dxnAgentLauncher{position:fixed;left:18px;bottom:78px;z-index:70;width:56px;height:56px;border-radius:50%;background:#fff;color:#0f513f;border:2px solid #0f513f;box-shadow:0 8px 24px #0003;font-size:25px;font-weight:900;cursor:pointer}
  #dxnAgentPanel{position:fixed;left:18px;bottom:145px;z-index:71;width:min(420px,calc(100vw - 36px));height:min(620px,calc(100vh - 175px));background:#fff;border:1px solid #dce8e3;border-radius:22px;box-shadow:0 18px 55px #0004;display:none;overflow:hidden;direction:rtl}
  #dxnAgentPanel.show{display:flex;flex-direction:column}
  .dxn-agent-head{background:linear-gradient(135deg,#0c4738,#1a725b);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
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
  function addMsg(text,who){
    const box=document.getElementById('dxnAgentMessages');if(!box)return;
    const d=el('div',{class:'dxn-agent-msg '+(who==='user'?'dxn-agent-user':'dxn-agent-ai')});
    d.textContent=text;box.appendChild(d);box.scrollTop=box.scrollHeight;
  }
  function setStatus(s){const x=document.getElementById('dxnAgentStatus');if(x)x.textContent=s||'';}
  async function speakAnswer(text){
    try{
      const token=sessionToken();if(!token||!text)return;
      const r=await fetch('/api/ai-agent-voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'speak',token,text})});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||('HTTP '+r.status));}
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const audio=new Audio(url);audio.preload='auto';
      audio.onended=()=>URL.revokeObjectURL(url);
      try{await audio.play();}catch(e){URL.revokeObjectURL(url);throw e;}
    }catch(e){setStatus('تم الرد نصيًا، وتعذر تشغيل الصوت تلقائيًا.');}
  }
  async function send(messageOverride){
    const input=document.getElementById('dxnAgentInput');const message=String(messageOverride!==undefined?messageOverride:(input&&input.value)||'').trim();
    if(!message)return;
    const token=sessionToken();
    if(!token){addMsg('يرجى تسجيل الدخول أولًا حتى أتمكن من قراءة بيانات حسابك.','ai');return;}
    addMsg(message,'user');input.value='';setStatus('جارٍ التفكير...');
    const history=[...document.querySelectorAll('#dxnAgentMessages .dxn-agent-msg')].slice(-14).map(x=>({
      role:x.classList.contains('dxn-agent-user')?'user':'assistant',content:x.textContent
    }));
    try{
      const r=await fetch('/api/ai-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,message,history})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      const answer=d.answer||'لم يصل رد من الوكيل.';addMsg(answer,'ai');setStatus('جارٍ تشغيل الرد الصوتي...');await speakAnswer(answer);setStatus('');
    }catch(e){addMsg('تعذر الاتصال بالوكيل: '+String(e.message||e),'ai');setStatus('');}
  }
  let voiceRecorder=null,voiceChunks=[],voiceMime='',voiceBusy=false;

  function setupVoice(){
    const mic=document.getElementById('dxnAgentMic');if(!mic)return;
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      mic.title='المتصفح لا يدعم التسجيل الصوتي';mic.disabled=true;return;
    }
    mic.addEventListener('click',async()=>{
      if(voiceBusy)return;
      if(voiceRecorder&&voiceRecorder.state==='recording'){voiceRecorder.stop();return;}
      const token=sessionToken();
      if(!token){addMsg('يرجى تسجيل الدخول أولًا.','ai');return;}
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        voiceMime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':
          (MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4');
        voiceRecorder=new MediaRecorder(stream,{mimeType:voiceMime});
        voiceChunks=[];
        voiceRecorder.ondataavailable=e=>{if(e.data&&e.data.size)voiceChunks.push(e.data);};
        voiceRecorder.onstop=async()=>{
          stream.getTracks().forEach(t=>t.stop());
          mic.classList.remove('recording');mic.textContent='🎙️';voiceBusy=true;
          try{
            const blob=new Blob(voiceChunks,{type:voiceMime});
            setStatus('جارٍ تحويل صوتك إلى نص...');
            const buffer=await blob.arrayBuffer();
            const bytes=new Uint8Array(buffer);let binary='';
            const step=0x8000;
            for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));
            const b64=btoa(binary);
            const r=await fetch('/api/ai-agent-voice',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({action:'transcribe',token,audio_base64:b64,filename:voiceMime.startsWith('audio/mp4')?'voice.mp4':'voice.webm',mime:voiceMime})
            });
            const d=await r.json().catch(()=>({}));
            if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
            const text=String(d.text||'').trim();
            if(!text)throw new Error('لم يتم التعرف على كلام واضح.');
            const input=document.getElementById('dxnAgentInput');if(input)input.value='';
            await send(text);
          }catch(e){
            addMsg('تعذر معالجة التسجيل الصوتي: '+String(e.message||e),'ai');setStatus('');
          }finally{voiceBusy=false;}
        };
        voiceRecorder.start();
        mic.classList.add('recording');mic.textContent='⏹️';setStatus('جارٍ التسجيل... اضغط مرة أخرى للإيقاف');
      }catch(e){
        addMsg('تعذر الوصول إلى الميكروفون. اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.','ai');setStatus('');
      }
    });
  }

  function mount(){
    if(document.getElementById('dxnAgentLauncher'))return;
    const style=el('style',{},STYLE);document.head.appendChild(style);
    const btn=el('button',{id:'dxnAgentLauncher',type:'button',title:'الوكيل الذكي'},'🤖');
    const panel=el('section',{id:'dxnAgentPanel','aria-label':'محادثة الوكيل الذكي'});
    panel.innerHTML='<div class="dxn-agent-head"><div><b>🤖 الوكيل الذكي</b><small>مساعدك ومدربك داخل المنصة</small></div><button class="dxn-agent-close" type="button">إغلاق</button></div><div id="dxnAgentMessages"></div><div id="dxnAgentStatus" class="dxn-agent-status"></div><form class="dxn-agent-form"><button id="dxnAgentMic" class="dxn-agent-mic" type="button" title="تحدث مع الوكيل">🎙️</button><textarea id="dxnAgentInput" placeholder="اكتب سؤالك هنا... أو اضغط 🎙️ للتحدث" rows="1"></textarea><button id="dxnAgentSend" type="submit">إرسال</button></form>';
    document.body.append(btn,panel);
    btn.addEventListener('click',()=>{panel.classList.toggle('show');if(panel.classList.contains('show'))document.getElementById('dxnAgentInput')?.focus();});
    panel.querySelector('.dxn-agent-close').addEventListener('click',()=>panel.classList.remove('show'));
    panel.querySelector('form').addEventListener('submit',e=>{e.preventDefault();send();});
    document.getElementById('dxnAgentInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
    setupVoice();
    addMsg('مرحبًا، أنا الوكيل الذكي. يمكنك سؤالي عن تدريباتك وتقدمك وما يمكنك فعله الآن.','ai');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();