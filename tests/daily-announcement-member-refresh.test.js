const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const page=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const script=page.match(/<script id="dxn-global-announcements-v1-script">([\s\S]*?)<\/script>/);
assert.ok(script,'announcement script must be present');

test('open member session receives the daily announcement without reloading the page',async()=>{
  const windowListeners={},documentListeners={},timeouts=[],intervals=[],modals=[];
  let available=[],fetchCount=0;
  const document={
    readyState:'complete',
    visibilityState:'visible',
    body:{appendChild(node){modals.push(node)}},
    createElement(){return {innerHTML:'',className:'',id:'',querySelector(){return null}}},
    getElementById(){return null},
    addEventListener(name,handler){documentListeners[name]=handler}
  };
  const window={
    addEventListener(name,handler){windowListeners[name]=handler}
  };
  const context={
    window,document,role:'member',
    localStorage:{getItem(name){return name==='dxn_session'?'member-token':null}},
    fetch:async()=>{
      fetchCount++;
      return {ok:true,text:async()=>JSON.stringify(available)};
    },
    setTimeout(fn){timeouts.push(fn);return timeouts.length},
    setInterval(fn,delay){intervals.push({fn,delay});return intervals.length},
    MutationObserver:class{observe(){}},
    location:{origin:'https://dxn-tahadi.vercel.app'},
    console
  };
  vm.runInNewContext(script[1],context,{filename:'global-announcements-inline.js'});

  // Before the 08:00 publication, the open session sees nothing.
  assert.equal(intervals.length,1);
  assert.equal(intervals[0].delay,60_000);
  for(const fn of timeouts.splice(0))await fn();
  assert.equal(fetchCount,1);
  assert.equal(modals.length,0);

  // At 08:00+ the message becomes available; the minute refresh displays it.
  available=[{id:'daily-2026-10-27',title:'صباح الصحة والثراء',body:'فكرة اليوم',
    source:'daily_ai',announcement_type:'announcement',created_at:'2026-10-27T05:00:26Z'}];
  await intervals[0].fn();
  assert.equal(fetchCount,2);
  assert.equal(modals.length,1);
  assert.match(modals[0].innerHTML,/صباح الصحة والثراء/);

  // While the modal is open, later refreshes must not duplicate it.
  await intervals[0].fn();
  assert.equal(modals.length,1);
  assert.equal(fetchCount,2);

  // Registration of reconnect/return handlers is required for sleeping tabs.
  for(const name of ['focus','pageshow','online','storage']){
    assert.equal(typeof windowListeners[name],'function',name);
  }
  assert.equal(typeof documentListeners.visibilitychange,'function');
});

test('hidden pages skip background polling until visible again',async()=>{
  assert.match(script[1],/if\(document\.visibilityState==='hidden'\)return/);
  assert.match(script[1],/document\.addEventListener\('visibilitychange',refreshAnnouncementsIfVisible\)/);
  assert.match(script[1],/window\.addEventListener\('online',refreshAnnouncementsIfVisible\)/);
});
