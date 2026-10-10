/* V86.80 — 🎙️ مدرب الاستقطاب الصوتي داخل نافذة المدرب وائل حاتم.
   محاكاة تدريبية فقط: لا اتصالات حقيقية، ولا واتساب، ولا أرقام هواتف.
   - لا يغيّر أي وظيفة حالية في ai-agent-chat.js؛ يضيف زرًا وواجهة فوق النافذة نفسها.
   - الصوت عبر واجهتين قابلتين للاستبدال: SpeechInput (ميكروفون → نص) و SpeechOutput (نص → صوت).
   - لا يُحفظ أي تسجيل صوتي: التسجيل يُرسل للتفريغ ثم يُترك للذاكرة. التقدم (بدون صوت) يُحفظ على الجهاز فقط. */
(function(){
  if(window.__DXN_RECRUITMENT_COACH_V8680__)return;
  window.__DXN_RECRUITMENT_COACH_V8680__=true;

  const API='/api/recruitment-coach';
  const VOICE_API='/api/ai-agent-voice';
  const MAX_RECORD_MS=60000;
  const MIN_AUDIO_BYTES=1200;
  const PROGRESS_KEY='dxn_recruitment_coach_progress_v1';
  const PROGRESS_LIMIT=50;
  const START_METERS={trust:35,interest:35};

  const PERSONAS=[
    ['employee_m','👨‍💼','موظف'],['employee_f','👩‍💼','موظفة'],['homemaker','🏠','ربة منزل'],
    ['job_seeker','🔎','باحث عن عمل'],['retiree','👴','متقاعد / متقاعدة'],['random','🎲','سيناريو عشوائي']
  ];
  const GOALS=[
    ['rapport','التعارف وكسر الحاجز'],['discover_need','اكتشاف الاحتياج'],['present_idea','طرح فكرة العمل'],
    ['invite','دعوة الشخص لمشاهدة عرض أو لقاء'],['objection','معالجة اعتراض'],['follow_up','متابعة شخص سابق'],
    ['next_step','الوصول إلى الخطوة التالية بدون ضغط']
  ];
  const LEVELS=[['beginner','مبتدئ'],['intermediate','متوسط'],['hard','صعب']];
  const CRITERIA=[
    ['opening','الافتتاح والتعارف'],['questions','جودة الأسئلة'],['listening','الاستماع'],
    ['need_discovery','اكتشاف الاحتياج'],['presentation','تقديم الفكرة'],['objection_handling','التعامل مع الاعتراض'],
    ['no_pressure','عدم الضغط'],['confidence_clarity','الثقة والوضوح'],['closing','الإغلاق / الخطوة التالية']
  ];
  const COACH_QUESTIONS=['أين أخطأت؟','ماذا كان الأفضل أن أقول؟','ما السؤال الأفضل الآن؟'];

  const STYLE=`
  .dxn-rc-entry{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px 10px 0;padding:10px 12px;border:1px solid #e7d39a;border-radius:14px;background:linear-gradient(135deg,#fffaf0,#fff);color:#0f513f;font-weight:900;font-size:14px;cursor:pointer;width:calc(100% - 20px)}
  .dxn-rc-entry:hover{background:#fff6df}
  #dxnRcView{position:absolute;inset:0;z-index:5;display:none;flex-direction:column;background:#f5f9f7;direction:rtl;color:#18352c}
  #dxnRcView.show{display:flex}
  .dxn-rc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:linear-gradient(135deg,#0c4738,#1a725b);color:#fff}
  .dxn-rc-head b{flex:1;font-size:15px}
  .dxn-rc-head button{border:1px solid #ffffff55;background:#ffffff22;color:#fff;border-radius:10px;padding:6px 10px;font-weight:800;cursor:pointer}
  .dxn-rc-body{flex:1;overflow:auto;padding:14px}
  .dxn-rc-section{margin-bottom:14px}
  .dxn-rc-section h4{margin:0 0 8px;font-size:14px;color:#0f513f}
  .dxn-rc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .dxn-rc-card{border:1.5px solid #dce8e3;background:#fff;border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer;font-weight:800;font-size:13px;color:#18352c}
  .dxn-rc-card span{display:block;font-size:24px;margin-bottom:4px}
  .dxn-rc-card[aria-pressed="true"],.dxn-rc-chip[aria-pressed="true"]{border-color:#c9a227;background:#fffaf0;box-shadow:0 0 0 2px #c9a22733}
  .dxn-rc-chips{display:flex;flex-wrap:wrap;gap:6px}
  .dxn-rc-chip{border:1.5px solid #dce8e3;background:#fff;border-radius:999px;padding:7px 11px;font-size:13px;font-weight:700;cursor:pointer;color:#18352c}
  .dxn-rc-primary{display:block;width:100%;border:0;border-radius:14px;padding:13px;background:linear-gradient(135deg,#0f513f,#1a8064);color:#fff;font-weight:900;font-size:15px;cursor:pointer}
  .dxn-rc-primary:disabled{opacity:.5;cursor:not-allowed}
  .dxn-rc-secondary{display:block;width:100%;margin-top:8px;border:1.5px solid #c9a227;border-radius:14px;padding:11px;background:#fff;color:#0f513f;font-weight:900;cursor:pointer}
  .dxn-rc-brief{background:#fff;border:1px solid #e7d39a;border-radius:16px;padding:14px;line-height:1.9;font-size:14px}
  .dxn-rc-brief div b{color:#0f513f}
  .dxn-rc-progress{font-size:12px;color:#667085;text-align:center;margin-top:10px}
  .dxn-rc-modes{display:flex;gap:6px;padding:8px 10px;background:#fff;border-bottom:1px solid #e2e8e5}
  .dxn-rc-modes button{flex:1;border:1.5px solid #dce8e3;border-radius:12px;padding:8px;background:#fff;font-weight:900;cursor:pointer;color:#18352c}
  .dxn-rc-modes button[aria-pressed="true"]{border-color:#0f513f;background:#eef8f2;color:#0f513f}
  .dxn-rc-meters{display:flex;gap:10px;padding:6px 12px 0;font-size:11px;color:#667085}
  .dxn-rc-meters div{flex:1}
  .dxn-rc-meter{height:6px;border-radius:9px;background:#e2e8e5;overflow:hidden;margin-top:3px}
  .dxn-rc-meter i{display:block;height:100%;background:linear-gradient(90deg,#c9a227,#1a8064);transition:width .4s}
  .dxn-rc-msgs{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
  .dxn-rc-msg{max-width:86%;padding:9px 12px;border-radius:15px;font-size:14px;line-height:1.7;white-space:pre-wrap}
  .dxn-rc-msg.persona{align-self:flex-end;background:#fff;border:1px solid #dce8e3}
  .dxn-rc-msg.trainee{align-self:flex-start;background:#0f513f;color:#fff}
  .dxn-rc-msg.coach{align-self:stretch;max-width:100%;background:#fffaf0;border:1px solid #e7d39a}
  .dxn-rc-msg small{display:block;font-size:11px;opacity:.7;font-weight:800;margin-bottom:2px}
  .dxn-rc-dock{padding:10px 12px 12px;background:#fff;border-top:1px solid #e2e8e5;text-align:center}
  .dxn-rc-status{min-height:20px;font-size:13px;font-weight:800;color:#0f513f;margin-bottom:8px}
  .dxn-rc-mic{width:84px;height:84px;border-radius:50%;border:0;background:linear-gradient(135deg,#0f513f,#1a8064);color:#fff;font-size:34px;cursor:pointer;box-shadow:0 8px 22px #0f513f44;transition:box-shadow .08s}
  .dxn-rc-mic.listening{background:linear-gradient(135deg,#b42318,#d9480f);box-shadow:0 0 0 calc(6px + var(--dxn-rc-level,0) * 26px) #d9480f33}
  .dxn-rc-mic:disabled{opacity:.45;cursor:not-allowed}
  .dxn-rc-row{display:flex;gap:8px;margin-top:10px}
  .dxn-rc-row input{flex:1;min-width:0;border:1px solid #dce8e3;border-radius:12px;padding:9px 10px;font-size:16px}
  .dxn-rc-row button{border:1px solid #dce8e3;border-radius:12px;background:#f5f9f7;padding:8px 12px;font-weight:800;cursor:pointer;color:#0f513f}
  .dxn-rc-end{margin-top:8px;border:0;background:none;color:#b42318;font-weight:900;cursor:pointer;font-size:13px}
  .dxn-rc-stop{display:none;margin:8px auto 0;border:1.5px solid #c9a227;border-radius:999px;background:#fffaf0;color:#0f513f;padding:6px 14px;font-weight:900;cursor:pointer;font-size:13px}
  .dxn-rc-voice-note{display:none;margin-bottom:8px;padding:6px 10px;border-radius:10px;background:#fff6df;border:1px solid #e7d39a;color:#7a5300;font-size:12px;font-weight:800}
  .dxn-rc-dots::after{content:'';animation:dxnRcDots 1.2s steps(4,end) infinite}
  @keyframes dxnRcDots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
  .dxn-rc-total{text-align:center;padding:14px;background:#fff;border:1px solid #e7d39a;border-radius:16px;margin-bottom:12px}
  .dxn-rc-total strong{display:block;font-size:42px;color:#0f513f;line-height:1.1}
  .dxn-rc-score{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px}
  .dxn-rc-score span{flex:0 0 150px}
  .dxn-rc-score .dxn-rc-meter{flex:1;margin:0;height:8px}
  .dxn-rc-score b{flex:0 0 34px;text-align:left}
  .dxn-rc-list{background:#fff;border:1px solid #dce8e3;border-radius:14px;padding:10px 12px;margin-bottom:10px;font-size:14px;line-height:1.8}
  .dxn-rc-list h5{margin:0 0 4px;font-size:14px}
  .dxn-rc-list ul{margin:0;padding-inline-start:18px}
  @media(max-width:380px){.dxn-rc-score span{flex-basis:112px}.dxn-rc-grid{grid-template-columns:repeat(2,1fr)}}
  @media(prefers-reduced-motion:reduce){.dxn-rc-mic{transition:none}.dxn-rc-dots::after{animation:none;content:'...'}}
  `;

  function token(){return String(localStorage.getItem('dxn_session')||'').trim();}
  function el(tag,attrs,children){
    const e=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs||{})){
      if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v);
    }
    for(const c of [].concat(children||[]))if(c)e.append(c);
    return e;
  }

  async function api(action,payload){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||('HTTP '+r.status));
    return data;
  }

  /* ---------- الصوت: مدخل ومخرج قابلان للاستبدال لاحقًا بمحرك Realtime ---------- */
  let audioCtx=null;
  function ensureAudioContext(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  function blobToBase64(blob){
    return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result).split(',')[1]||'');fr.onerror=reject;fr.readAsDataURL(blob);});
  }

  /* الأساسي: تسجيل محلي ثم تفريغ عبر /api/ai-agent-voice (يعمل على iPhone ويدعم اللهجة العراقية). */
  function createRecorderInput(){
    let stream=null,recorder=null,chunks=[],raf=0,timer=0,mime='';
    function pickMime(){
      for(const m of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
        if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))return m;
      return '';
    }
    function release(){
      cancelAnimationFrame(raf);clearTimeout(timer);
      if(stream)stream.getTracks().forEach(t=>t.stop());
      stream=null;recorder=null;
    }
    return {
      name:'recorder',
      async start(onLevel,onAutoStop){
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
        mime=pickMime();chunks=[];
        recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
        recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
        recorder.start(250);
        const ctx=ensureAudioContext();
        if(ctx&&onLevel){
          const analyser=ctx.createAnalyser();analyser.fftSize=256;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const buf=new Uint8Array(analyser.frequencyBinCount);
          const tick=()=>{analyser.getByteTimeDomainData(buf);let peak=0;for(const v of buf)peak=Math.max(peak,Math.abs(v-128));onLevel(Math.min(1,peak/64));raf=requestAnimationFrame(tick);};
          tick();
        }
        timer=setTimeout(()=>onAutoStop&&onAutoStop(),MAX_RECORD_MS);
      },
      stop(){
        return new Promise((resolve,reject)=>{
          if(!recorder){resolve('');return;}
          const type=recorder.mimeType||mime||'audio/webm';
          recorder.onstop=async()=>{
            const blob=new Blob(chunks,{type});chunks=[];release();
            if(blob.size<MIN_AUDIO_BYTES){resolve('');return;}
            try{
              const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
              const r=await fetch(VOICE_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'transcribe',token:token(),audio_base64:await blobToBase64(blob),mime:type.split(';')[0],filename:'trainee.'+ext})});
              const d=await r.json().catch(()=>({}));
              if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
              resolve(String(d.text||'').trim());
            }catch(e){reject(e);}
          };
          try{recorder.stop();}catch(e){release();reject(e);}
        });
      },
      cancel(){try{if(recorder&&recorder.state!=='inactive'){recorder.onstop=null;recorder.stop();}}catch(_){}chunks=[];release();}
    };
  }

  /* احتياطي: التعرف على الكلام داخل المتصفح (Chrome/Edge). */
  function createBrowserInput(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    let rec=null,finalText='',done=null,timer=0;
    return {
      name:'browser',
      start(onLevel,onAutoStop){
        return new Promise((resolve,reject)=>{
          finalText='';rec=new SR();rec.lang='ar-IQ';rec.continuous=true;rec.interimResults=true;
          rec.onstart=()=>{if(onLevel)onLevel(.5);resolve();};
          rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)finalText+=' '+e.results[i][0].transcript;};
          rec.onerror=e=>{const err=new Error(e.error==='not-allowed'?'اسمح للمتصفح باستخدام الميكروفون.':'تعذر التعرف على الصوت: '+e.error);if(done){done.reject(err);done=null;}else reject(err);};
          rec.onend=()=>{clearTimeout(timer);if(onLevel)onLevel(0);if(done){done.resolve(finalText.trim());done=null;}};
          rec.start();
          timer=setTimeout(()=>onAutoStop&&onAutoStop(),MAX_RECORD_MS);
        });
      },
      stop(){return new Promise((resolve,reject)=>{if(!rec){resolve('');return;}done={resolve,reject};try{rec.stop();}catch(_){resolve(finalText.trim());}});},
      cancel(){clearTimeout(timer);done=null;try{rec&&rec.abort();}catch(_){}}
    };
  }

  function createSpeechInput(){
    if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)return createRecorderInput();
    if(window.SpeechRecognition||window.webkitSpeechRecognition)return createBrowserInput();
    return null;
  }

  /* V86.81 — مخرج الصوت: يطلب الصوت من الخادم (MiniMax أو الاحتياطي) لنص موقّع من الخادم فقط.
     Streaming: إذا دعم المتصفح MediaSource لـ mp3 (Chrome/Android/Safari للحاسوب) يبدأ التشغيل مع أول جزء.
     غير ذلك (iPhone) يُشغَّل بعد اكتمال الرد عبر Web Audio. stop() يقطع الصوت فورًا (لبدء دور المتدرب). */
  function canStreamAudio(){
    return !!(window.MediaSource&&MediaSource.isTypeSupported&&MediaSource.isTypeSupported('audio/mpeg'));
  }
  function createSpeechOutput(){
    let source=null,audioEl=null,reader=null,finish=null,generation=0;
    function settle(){if(finish){const f=finish;finish=null;f();}}
    function stop(){
      generation++;
      try{source&&source.stop();}catch(_){}
      try{reader&&reader.cancel();}catch(_){}
      if(audioEl){audioEl.pause();audioEl.removeAttribute('src');audioEl=null;}
      source=null;reader=null;settle();
    }
    async function playBuffer(data,onStart,gen){
      if(gen!==generation)return settle();
      const ctx=ensureAudioContext();
      try{
        if(!ctx)throw new Error('no-audio-context');
        const decoded=await ctx.decodeAudioData(data.slice(0));
        if(gen!==generation)return settle();
        source=ctx.createBufferSource();source.buffer=decoded;source.connect(ctx.destination);
        source.onended=()=>{source=null;settle();};
        onStart&&onStart();source.start(0);
      }catch(_){
        const url=URL.createObjectURL(new Blob([data],{type:'audio/mpeg'}));
        audioEl=new Audio(url);
        audioEl.onended=()=>{URL.revokeObjectURL(url);audioEl=null;settle();};
        onStart&&onStart();
        audioEl.play().catch(settle);
      }
    }
    /* بث mp3 إلى عنصر audio عبر MediaSource. إذا رفض المتصفح التشغيل التلقائي نكمل من نسخة مخزنة (tee). */
    function playStream(body,onStart,gen){
      const [live,copy]=body.tee();
      const collected=[];
      const collecting=(async()=>{const rd=copy.getReader();for(;;){const {done,value}=await rd.read();if(done)break;collected.push(value);}})().catch(()=>{});
      const ms=new MediaSource();
      const el=new Audio();audioEl=el;
      el.src=URL.createObjectURL(ms);
      el.onended=()=>{if(audioEl===el)audioEl=null;settle();};
      ms.addEventListener('sourceopen',async()=>{
        const sb=ms.addSourceBuffer('audio/mpeg');
        const append=chunk=>new Promise((res,rej)=>{sb.addEventListener('updateend',res,{once:true});sb.addEventListener('error',rej,{once:true});sb.appendBuffer(chunk);});
        reader=live.getReader();
        let playing=false;
        try{
          for(;;){
            const {done,value}=await reader.read();
            if(done||gen!==generation)break;
            await append(value);
            if(!playing){
              playing=true;
              el.play().then(()=>onStart&&onStart()).catch(async()=>{
                /* التشغيل التلقائي مرفوض: نشغّل النسخة الكاملة عبر Web Audio الذي فُتح بضغطة المستخدم. */
                try{reader.cancel();}catch(_){}
                audioEl=null;
                await collecting;
                playBuffer(await new Blob(collected).arrayBuffer(),onStart,gen);
              });
            }
          }
          if(ms.readyState==='open'&&!sb.updating)ms.endOfStream();
          if(!playing)settle();
        }catch(_){settle();}
      },{once:true});
    }
    return {
      stop,
      isPlaying(){return !!finish;},
      async speak({text,speech,scenario},onStart){
        stop();
        const gen=generation;
        const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          action:'speak',token:token(),text,speech,
          scenario:scenario?{gender:scenario.gender,voice:scenario.voice,age:scenario.age,time_availability:scenario.time_availability}:{}
        })});
        if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||('HTTP '+r.status));}
        if(gen!==generation)return;
        return new Promise(resolve=>{
          finish=resolve;
          if(r.body&&canStreamAudio())playStream(r.body,onStart,gen);
          else r.arrayBuffer().then(data=>playBuffer(data,onStart,gen)).catch(settle);
        });
      }
    };
  }

  /* ---------- التقدم: على الجهاز فقط الآن، وبنفس الشكل الذي سيُحفظ لاحقًا في قاعدة البيانات ---------- */
  const progressStore={
    key(){try{const n=(typeof me!=='undefined'&&me&&(me.member_no||me.membership_no))||'';return PROGRESS_KEY+(n?':'+n:'');}catch(_){return PROGRESS_KEY;}},
    list(){try{const v=JSON.parse(localStorage.getItem(this.key())||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}},
    add(entry){try{const all=[...this.list(),entry].slice(-PROGRESS_LIMIT);localStorage.setItem(this.key(),JSON.stringify(all));}catch(_){}}
  };

  /* ---------- الحالة والواجهة ---------- */
  const state={setup:{persona:'',goal:'',level:''},scenario:null,openingSpeech:null,history:[],meters:{...START_METERS},mode:'sim',busy:false,listening:false,speaking:false,speakSeq:0,voice:null};
  let view=null,speechIn=null;
  const speechOut=createSpeechOutput();

  function setStatus(text,dots){
    const s=view&&view.querySelector('.dxn-rc-status');if(!s)return;
    s.textContent=text||'';s.classList.toggle('dxn-rc-dots',!!dots);
  }
  function header(title,onBack){
    return el('div',{class:'dxn-rc-head'},[
      el('b',{text:title}),
      onBack?el('button',{type:'button',text:'رجوع',onclick:onBack}):null,
      el('button',{type:'button',text:'✕',title:'العودة إلى المدرب','aria-label':'إغلاق مدرب الاستقطاب',onclick:close})
    ]);
  }
  function render(children){view.replaceChildren(...children.filter(Boolean));}
  function choiceGroup(className,items,key,onChange){
    const group=el('div',{class:className==='dxn-rc-card'?'dxn-rc-grid':'dxn-rc-chips'});
    items.forEach(item=>{
      const [value,iconOrLabel,label]=item;
      const b=el('button',{type:'button',class:className,'aria-pressed':String(state.setup[key]===value)},label?[el('span',{text:iconOrLabel}),label]:[iconOrLabel]);
      b.addEventListener('click',()=>{state.setup[key]=value;group.querySelectorAll('[aria-pressed]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));onChange();});
      group.append(b);
    });
    return group;
  }

  function renderSetup(){
    stopAll();
    const s=state.setup;
    const next=el('button',{class:'dxn-rc-primary',type:'button',text:'التالي: جهّز السيناريو',onclick:prepareScenario});
    const sync=()=>{next.disabled=!(s.persona&&s.goal&&s.level);};
    sync();
    const done=progressStore.list();
    const progress=done.length
      ?`جلساتك التدريبية: ${done.length} · آخر درجة: ${done[done.length-1].total}/100 · أفضل درجة: ${Math.max(...done.map(x=>x.total))}/100`
      :'محاكاة تدريبية فقط — لا اتصال حقيقي بأي شخص.';
    render([
      header('🎙️ مدرب الاستقطاب الصوتي'),
      el('div',{class:'dxn-rc-body'},[
        el('div',{class:'dxn-rc-section'},[el('h4',{text:'1. اختر الشخصية'}),choiceGroup('dxn-rc-card',PERSONAS,'persona',sync)]),
        el('div',{class:'dxn-rc-section'},[el('h4',{text:'2. هدف التدريب'}),choiceGroup('dxn-rc-chip',GOALS,'goal',sync)]),
        el('div',{class:'dxn-rc-section'},[el('h4',{text:'3. مستوى الصعوبة'}),choiceGroup('dxn-rc-chip',LEVELS,'level',sync)]),
        next,
        el('div',{class:'dxn-rc-progress',text:progress})
      ])
    ]);
  }

  async function prepareScenario(){
    stopAll();
    render([header('🎙️ تجهيز السيناريو',renderSetup),el('div',{class:'dxn-rc-body'},[el('div',{class:'dxn-rc-brief'},[el('span',{class:'dxn-rc-dots',text:'المدرب يجهّز شخصية جديدة'})])])]);
    try{
      const d=await api('scenario',{setup:state.setup});
      state.scenario=d.scenario;
      state.openingSpeech=d.opening_speech||null;
      renderBrief();
    }catch(e){
      render([header('🎙️ تجهيز السيناريو',renderSetup),el('div',{class:'dxn-rc-body'},[
        el('div',{class:'dxn-rc-brief',text:'تعذر تجهيز السيناريو: '+e.message}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'حاول مرة أخرى',onclick:prepareScenario})
      ])]);
    }
  }

  function renderBrief(){
    const sc=state.scenario;
    const goal=GOALS.find(g=>g[0]===state.setup.goal)[1];
    const level=LEVELS.find(l=>l[0]===state.setup.level)[1];
    const row=(k,v)=>el('div',{},[el('b',{text:k+': '}),String(v)]);
    render([
      header('🎙️ بطاقة السيناريو',renderSetup),
      el('div',{class:'dxn-rc-body'},[
        el('div',{class:'dxn-rc-brief'},[
          row('الشخصية',`${sc.persona_label} — ${sc.display_name}`),
          row('العمر الافتراضي',sc.age),
          row('الوضع',sc.situation),
          row('الاعتراض المتوقع',sc.expected_objection),
          row('هدفك',sc.success_goal),
          row('التدريب',`${goal} · ${level}`)
        ]),
        el('div',{style:'height:12px'}),
        el('button',{class:'dxn-rc-primary',type:'button',text:'🎙️ ابدأ التدريب',onclick:startSession}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'🎲 بطاقة أخرى',onclick:prepareScenario})
      ])
    ]);
  }

  function startSession(){
    ensureAudioContext();
    state.history=[];state.meters={...START_METERS};state.mode='sim';
    renderSession();
    const opening=state.scenario.opening_line;
    if(opening){state.history.push({role:'persona',content:opening});addMsg('persona',opening);speakText('persona',opening,state.openingSpeech);}
  }

  function renderSession(){
    const sc=state.scenario;
    const modeBtn=(mode,text)=>el('button',{type:'button','data-mode':mode,'aria-pressed':String(state.mode===mode),text,onclick:()=>setMode(mode)});
    const meter=(label,key)=>el('div',{},[label,el('div',{class:'dxn-rc-meter'},[el('i',{'data-meter':key,style:`width:${state.meters[key]}%`})])]);
    const input=el('input',{type:'text',placeholder:'أو اكتب جملتك هنا…','aria-label':'اكتب رسالتك'});
    const sendText=()=>{const v=input.value.trim();if(!v||state.busy)return;input.value='';handleUtterance(v);};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendText();}});
    const quick=el('div',{class:'dxn-rc-chips','data-coach-quick':'',style:'justify-content:center;margin-bottom:8px'});
    COACH_QUESTIONS.forEach(q=>quick.append(el('button',{type:'button',class:'dxn-rc-chip',text:q,onclick:()=>{if(!state.busy)handleUtterance(q);}})));
    render([
      header(`${sc.persona_label} — ${sc.display_name}`),
      el('div',{class:'dxn-rc-modes'},[modeBtn('sim','🎭 وضع المحاكاة'),modeBtn('coach','🎓 وضع المدرب')]),
      el('div',{class:'dxn-rc-meters'},[meter('الثقة','trust'),meter('الاهتمام','interest')]),
      el('div',{class:'dxn-rc-msgs',role:'log','aria-live':'polite'}),
      el('div',{class:'dxn-rc-dock'},[
        quick,
        el('div',{class:'dxn-rc-voice-note','data-voice-note':'',text:'صوت المدرب وائل حاتم لم يتم تفعيله بعد — يُستخدم صوت تجريبي مؤقت.'}),
        el('div',{class:'dxn-rc-status',role:'status'}),
        el('button',{type:'button',class:'dxn-rc-mic','aria-label':'اضغط وتحدث',text:'🎙️',onclick:toggleMic}),
        el('button',{type:'button',class:'dxn-rc-stop','data-stop-audio':'',text:'⏹ إيقاف الصوت',onclick:stopSpeaking}),
        el('div',{class:'dxn-rc-row'},[input,el('button',{type:'button',text:'إرسال',onclick:sendText})]),
        el('button',{type:'button',class:'dxn-rc-end',text:'⏹ إنهاء المحادثة والتقييم',onclick:finishSession})
      ])
    ]);
    syncModeUi();
  }

  function setMode(mode){
    if(state.busy&&!state.listening)return;
    cancelListening();stopSpeaking();
    state.mode=mode;
    view.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-mode')===mode)));
    syncModeUi();
    if(mode==='coach')addMsg('coach','المحاكاة متوقفة. اسألني: أين أخطأت؟ ماذا كان الأفضل أن تقول؟ أو ما السؤال الأفضل الآن؟ وعندما تكون جاهزًا ارجع إلى 🎭 وضع المحاكاة.');
  }
  function syncModeUi(){
    const quick=view.querySelector('[data-coach-quick]');
    if(quick)quick.style.display=state.mode==='coach'?'flex':'none';
    const note=view.querySelector('[data-voice-note]');
    if(note)note.style.display=state.mode==='coach'&&!coachVoiceReady()?'block':'none';
    setStatus(state.mode==='coach'?'🎓 أنت تتحدث الآن مع المدرب وائل حاتم':'🎭 اضغط الميكروفون وتحدث مع الشخصية');
  }
  function coachVoiceReady(){return !!(state.voice&&state.voice.coach_voice_ready);}
  function updateMeters(){
    view.querySelectorAll('[data-meter]').forEach(i=>{i.style.width=state.meters[i.getAttribute('data-meter')]+'%';});
  }
  function addMsg(kind,text){
    const box=view&&view.querySelector('.dxn-rc-msgs');if(!box)return;
    const who=kind==='persona'?state.scenario.display_name:kind==='coach'?'🎓 المدرب وائل حاتم':'أنت';
    box.append(el('div',{class:'dxn-rc-msg '+kind},[el('small',{text:who}),text]));
    box.scrollTop=box.scrollHeight;
  }
  function setBusy(b){
    state.busy=b;
    const mic=view&&view.querySelector('.dxn-rc-mic');
    if(mic)mic.disabled=b&&!state.listening;
  }
  function micButton(){return view&&view.querySelector('.dxn-rc-mic');}
  function resetMicButton(){
    const mic=micButton();if(!mic)return;
    mic.classList.remove('listening');mic.textContent='🎙️';mic.style.removeProperty('--dxn-rc-level');
  }

  async function stopListeningAndSend(){
    state.listening=false;resetMicButton();
    setStatus('جارٍ تحويل كلامك إلى نص',true);
    try{
      const text=await speechIn.stop();
      setBusy(false);
      if(!text){setStatus('لم أسمع كلامًا واضحًا. حاول مرة أخرى.');return;}
      handleUtterance(text);
    }catch(e){setBusy(false);setStatus('تعذر تحويل الصوت: '+e.message);}
  }

  /* الضغط على الميكروفون أثناء كلام الشخصية أو المدرب يقطع الصوت ويبدأ دور المتدرب مباشرة. */
  async function toggleMic(){
    if(state.listening)return stopListeningAndSend();
    if(state.busy)return;
    stopSpeaking();
    speechIn=speechIn||createSpeechInput();
    if(!speechIn){setStatus('الميكروفون غير مدعوم في هذا المتصفح؛ اكتب جملتك في الخانة بالأسفل.');return;}
    ensureAudioContext();
    const mic=micButton();
    try{
      setBusy(true);state.listening=true;
      await speechIn.start(level=>mic.style.setProperty('--dxn-rc-level',level.toFixed(2)),()=>{if(state.listening)stopListeningAndSend();});
      mic.classList.add('listening');mic.textContent='⏹️';mic.disabled=false;
      setStatus('🎙️ أستمع إليك... اضغط مرة ثانية عندما تنتهي');
    }catch(e){
      state.listening=false;setBusy(false);resetMicButton();
      const denied=/Permission|NotAllowed|اسمح/i.test(String(e.message||'')+String(e.name||''));
      setStatus(denied?'اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.':'تعذر تشغيل الميكروفون: '+(e.message||e.name));
    }
  }
  function cancelListening(){
    if(!state.listening)return;
    state.listening=false;
    try{speechIn&&speechIn.cancel();}catch(_){}
    resetMicButton();setBusy(false);
  }

  async function handleUtterance(text){
    stopSpeaking();
    if(state.mode==='coach')return askCoach(text);
    addMsg('trainee',text);
    const history=state.history.slice();
    state.history.push({role:'trainee',content:text});
    setBusy(true);setStatus('🧠 الشخصية تفكر...');
    let d=null;
    try{
      d=await api('turn',{setup:state.setup,scenario:state.scenario,history,state:state.meters,message:text});
      state.meters=d.state;updateMeters();
      state.history.push({role:'persona',content:d.reply});
      addMsg('persona',d.reply);
    }catch(e){
      state.history.pop();
      setStatus('تعذر الحصول على رد الشخصية: '+e.message);
    }finally{setBusy(false);}
    if(!d)return;
    const after=d.outcome==='agreed_next_step'?'✅ وصلت إلى خطوة تالية. يمكنك إنهاء المحادثة للتقييم أو المتابعة.'
      :d.outcome==='declined'?'الشخصية أنهت الحوار. اضغط «إنهاء المحادثة والتقييم».':null;
    speakText('persona',d.reply,d.speech,after);
  }

  /* الكلام لا يقفل الواجهة: يمكن إيقافه أو الضغط على الميكروفون لبدء الدور التالي. */
  async function speakText(role,text,speech,afterStatus){
    if(!speech)return;
    const myTurn=++state.speakSeq;
    state.speaking=true;showStop(true);
    setStatus(role==='coach'?'🔊 المدرب وائل حاتم يحضّر الرد...':'🔊 تجهيز الصوت...');
    let failed=false;
    try{
      await speechOut.speak({text,speech,scenario:role==='persona'?state.scenario:null},()=>{
        if(myTurn===state.speakSeq)setStatus(role==='coach'?'🔊 المدرب وائل حاتم يتحدث الآن...':'🔊 يتحدث الآن...');
      });
    }catch(_){failed=true;}
    if(myTurn!==state.speakSeq)return;
    state.speaking=false;showStop(false);
    if(state.listening||state.busy)return;
    if(failed)setStatus(role==='coach'?'🎓 تعذر تشغيل صوت المدرب؛ الرد مكتوب أعلاه':'🎭 دورك (تعذر تشغيل الصوت، الرد مكتوب أعلاه)');
    else setStatus(afterStatus||(role==='coach'?'🎓 اسأل سؤالًا آخر أو ارجع إلى 🎭 وضع المحاكاة':'🎭 دورك — اضغط الميكروفون'));
  }
  function stopSpeaking(){
    if(!state.speaking)return;
    state.speakSeq++;state.speaking=false;
    speechOut.stop();showStop(false);
    if(!state.listening&&!state.busy)setStatus(state.mode==='coach'?'🎓 اسأل سؤالًا آخر أو ارجع إلى 🎭 وضع المحاكاة':'🎭 دورك — اضغط الميكروفون');
  }
  function showStop(on){
    const b=view&&view.querySelector('[data-stop-audio]');
    if(b)b.style.display=on?'inline-block':'none';
  }

  async function askCoach(question){
    addMsg('trainee',question);
    setBusy(true);setStatus('🧠 المدرب وائل حاتم يفكر...');
    let d=null;
    try{
      d=await api('coach',{setup:state.setup,scenario:state.scenario,history:state.history,question});
      addMsg('coach',d.answer);
    }catch(e){setStatus('تعذر الوصول إلى المدرب: '+e.message);}
    finally{setBusy(false);}
    if(d)speakText('coach',d.answer,d.speech);
  }

  function backToConversation(){
    const history=state.history;
    renderSession();
    history.forEach(t=>addMsg(t.role,t.content));
  }

  async function finishSession(){
    cancelListening();speechOut.stop();
    if(!state.history.some(t=>t.role==='trainee')){setStatus('تحدث مع الشخصية أولًا قبل طلب التقييم.');return;}
    render([header('📋 تقرير المدرب وائل حاتم'),el('div',{class:'dxn-rc-body'},[el('div',{class:'dxn-rc-total'},[el('span',{class:'dxn-rc-dots',text:'المدرب يقيّم أداءك'})])])]);
    try{
      const d=await api('evaluate',{setup:state.setup,scenario:state.scenario,history:state.history});
      progressStore.add({
        date:new Date().toISOString(),
        persona_key:state.scenario.persona_key,
        goal:state.setup.goal,
        level:state.setup.level,
        total:d.report.total,
        scores:d.report.scores,
        turns:state.history.filter(t=>t.role==='trainee').length
      });
      renderReport(d.report);
    }catch(e){
      render([header('📋 التقييم'),el('div',{class:'dxn-rc-body'},[
        el('div',{class:'dxn-rc-brief',text:'تعذر إعداد التقرير: '+e.message}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'حاول مرة أخرى',onclick:finishSession}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'العودة إلى المحادثة',onclick:backToConversation})
      ])]);
    }
  }

  function renderReport(report){
    const previous=progressStore.list().slice(0,-1).filter(x=>x.persona_key===state.scenario.persona_key&&x.goal===state.setup.goal);
    const trend=previous.length?` · المحاولة السابقة لنفس النوع والهدف: ${previous[previous.length-1].total}`:'';
    const list=(title,items)=>items.length?el('div',{class:'dxn-rc-list'},[el('h5',{text:title}),el('ul',{},items.map(t=>el('li',{text:t})))]):null;
    const alternatives=report.alternatives.map(a=>a.instead_of?`بدل «${a.instead_of}» قل: «${a.better}»`:a.better);
    render([
      header('📋 تقرير المدرب وائل حاتم'),
      el('div',{class:'dxn-rc-body'},[
        el('div',{class:'dxn-rc-total'},[el('strong',{text:String(report.total)}),'من 100'+trend]),
        el('div',{class:'dxn-rc-list'},CRITERIA.map(([k,label])=>el('div',{class:'dxn-rc-score'},[
          el('span',{text:label}),
          el('div',{class:'dxn-rc-meter'},[el('i',{style:`width:${report.scores[k]*10}%`})]),
          el('b',{text:report.scores[k]+'/10'})
        ]))),
        list('✅ ما الذي فعلته جيدًا',report.strengths),
        list('⚠️ أين تحتاج إلى تحسين',report.improvements),
        list('💡 ماذا كان يمكن أن تقول بدلًا من ذلك',alternatives),
        report.next_drill?el('div',{class:'dxn-rc-list'},[el('h5',{text:'🎯 تمرينك القادم'}),report.next_drill]):null,
        el('button',{class:'dxn-rc-primary',type:'button',text:'🔁 أعد نفس السيناريو',onclick:startSession}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'🎲 سيناريو جديد',onclick:prepareScenario}),
        el('button',{class:'dxn-rc-secondary',type:'button',text:'تغيير الشخصية أو الهدف',onclick:renderSetup})
      ])
    ]);
  }

  function stopAll(){cancelListening();stopSpeaking();speechOut.stop();}
  function open(){
    if(!token()){
      const box=document.getElementById('dxnAgentMessages');
      if(box)box.append(el('div',{class:'dxn-agent-msg dxn-agent-ai',text:'سجّل الدخول أولًا حتى تستخدم 🎙️ مدرب الاستقطاب الصوتي.'}));
      return;
    }
    view.classList.add('show');
    renderSetup();
    if(!state.voice)api('voice_status',{}).then(d=>{state.voice=d.voice||null;}).catch(()=>{});
  }
  function close(){stopAll();view.classList.remove('show');}

  function mount(){
    const panel=document.getElementById('dxnAgentPanel');
    if(!panel)return false;
    if(document.getElementById('dxnRcView'))return true;
    document.head.append(el('style',{id:'dxn-recruitment-coach-v8680'},[STYLE]));
    const head=panel.querySelector('.dxn-agent-head');
    const entry=el('button',{type:'button',class:'dxn-rc-entry',id:'dxnRcOpen',text:'🎙️ مدرب الاستقطاب الصوتي',onclick:open});
    if(head)head.after(entry);else panel.prepend(entry);
    view=el('section',{id:'dxnRcView','aria-label':'مدرب الاستقطاب الصوتي'});
    panel.append(view);
    /* إغلاق نافذة المدرب يوقف الميكروفون والصوت فورًا. */
    new MutationObserver(()=>{if(!panel.classList.contains('show'))stopAll();}).observe(panel,{attributes:true,attributeFilter:['class']});
    return true;
  }
  function boot(){
    if(mount())return;
    const obs=new MutationObserver(()=>{if(mount())obs.disconnect();});
    obs.observe(document.body,{childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
