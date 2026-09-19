    const fallbackHistory=cleanHistory(body.history);
    const history=(persistentMemory.length?persistentMemory:fallbackHistory).slice(-24);
    const baseInput=[...history,{role:'user',content:message}];
    let enrichedContext={
      ...context,
      coaching_profile:coachingProfile,
      coaching_session:currentSession,
      ...(dailyAutoPlan?{daily_auto_plan:dailyAutoPlan}: {})
    };
    let input=baseInput;
    let ai=null;
    const maxToolRounds=3;

    for(let round=0;round<=maxToolRounds;round++){
      ai=await openai({
        model:OPENAI_MODEL,
        instructions:instructions(enrichedContext),
        input,
        tools:AGENT_TOOL_DEFINITIONS,
        tool_choice:'auto',
        max_output_tokens:900
      });
      if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});

      const calls=getFunctionCalls(ai.data);
      if(!calls.length)break;
      if(round===maxToolRounds)throw new Error('تجاوز الوكيل الحد المسموح لاستدعاءات الأدوات');

      const outputs=[];
      let dailyTaskCompleted=false;
      let blockedCompletionAttempt=false;
      for(const call of calls){
        try{
          const result=await executeAgentTool(call,token,message);
          outputs.push({
            type:'function_call_output',
            call_id:call.call_id,
            output:JSON.stringify(result)
          });
          if(call.name==='complete_daily_coaching_task' && result?.completed){
            dailyTaskCompleted=true;
          }
          if(call.name==='complete_daily_coaching_task' && result?.blocked){
            blockedCompletionAttempt=true;
          }
        }catch(toolError){
          outputs.push({
            type:'function_call_output',            call_id:call.call_id,
            output:JSON.stringify({error:String(toolError&&toolError.message||toolError)})
          });
        }
      }

      input=[...(Array.isArray(ai.data.output)?ai.data.output:[]),...outputs];

      if(blockedCompletionAttempt){
        ai=await openai({
          model:OPENAI_MODEL,
          instructions:instructions(enrichedContext),
          input,
          tools:[],
          tool_choice:'none',
          max_output_tokens:900
        });
        if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});
        break;
      }

      if(dailyTaskCompleted){
        const advanced=await startNextDailySession(token,currentSession).catch(()=>null);
        if(advanced){
          currentSession=advanced.session;
          dailyAutoPlan=advanced.plan;