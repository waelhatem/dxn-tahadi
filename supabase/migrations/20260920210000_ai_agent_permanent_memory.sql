-- ============================================================
-- Permanent AI memory / audit trail
-- Never pruned by application retention logic.
-- Stores immutable snapshots of conversations, test answers,
-- causal learning and learning patterns.
-- ============================================================

create table if not exists public.ai_agent_permanent_memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  member_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_perm_user_created_idx
  on public.ai_agent_permanent_memory_events(user_id, created_at desc);

create index if not exists ai_agent_perm_member_created_idx
  on public.ai_agent_permanent_memory_events(member_id, created_at desc);

create index if not exists ai_agent_perm_entity_idx
  on public.ai_agent_permanent_memory_events(entity_type, entity_id, created_at desc);

alter table public.ai_agent_permanent_memory_events enable row level security;

revoke all on table public.ai_agent_permanent_memory_events from public, anon, authenticated;

-- Internal append helper. It is called only by SECURITY DEFINER trigger functions.
create or replace function public.ai_agent_append_permanent_event(
  p_user_id uuid,
  p_member_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  event_id uuid;
begin
  insert into public.ai_agent_permanent_memory_events(
    user_id,
    member_id,
    event_type,
    entity_type,
    entity_id,
    payload
  )
  values(
    p_user_id,
    p_member_id,
    left(trim(coalesce(p_event_type,'event')),80),
    left(trim(coalesce(p_entity_type,'unknown')),80),
    nullif(left(trim(coalesce(p_entity_id,'')),200),''),
    coalesce(p_payload,'{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$function$;


-- ============================================================
-- Conversation messages: every insert/update/delete is archived.
-- ============================================================

create or replace function public.trg_archive_ai_agent_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,
      null,
      'created',
      'ai_agent_message',
      new.id::text,
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,
      null,
      'updated_before',
      'ai_agent_message',
      old.id::text,
      to_jsonb(old)
    );
    perform public.ai_agent_append_permanent_event(
      new.user_id,
      null,
      'updated_after',
      'ai_agent_message',
      new.id::text,
      to_jsonb(new)
    );
    return new;
  else
    perform public.ai_agent_append_permanent_event(
      old.user_id,
      null,
      'deleted',
      'ai_agent_message',
      old.id::text,
      to_jsonb(old)
    );
    return old;
  end if;
end;
$function$;

drop trigger if exists trg_archive_ai_agent_message
  on public.ai_agent_messages;

create trigger trg_archive_ai_agent_message
after insert or update or delete
on public.ai_agent_messages
for each row
execute function public.trg_archive_ai_agent_message();


-- ============================================================
-- Training/test answers: every version is archived.
-- This preserves attempts, answers, review status, scores and notes
-- even when the visible current row is later edited or removed.
-- ============================================================

create or replace function public.trg_archive_training_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_member_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_member_id := old.member_id;
    select au.id
      into v_user_id
    from public.app_users au
    where au.member_id = v_member_id
      and au.active = true
    order by au.created_at asc
    limit 1;

    perform public.ai_agent_append_permanent_event(
      v_user_id,
      v_member_id,
      'deleted',
      'training_answer',
      old.id::text,
      to_jsonb(old)
    );
    return old;
  end if;

  v_member_id := new.member_id;

  select au.id
    into v_user_id
  from public.app_users au
  where au.member_id = v_member_id
    and au.active = true
  order by au.created_at asc
  limit 1;

  if tg_op = 'INSERT' then
    perform public.ai_agent_append_permanent_event(
      v_user_id,
      v_member_id,
      'created',
      'training_answer',
      new.id::text,
      to_jsonb(new)
    );
  else
    perform public.ai_agent_append_permanent_event(
      v_user_id,
      v_member_id,
      'updated_before',
      'training_answer',
      old.id::text,
      to_jsonb(old)
    );
    perform public.ai_agent_append_permanent_event(
      v_user_id,
      v_member_id,
      'updated_after',
      'training_answer',
      new.id::text,
      to_jsonb(new)
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_archive_training_answer
  on public.training_answers;

create trigger trg_archive_training_answer
after insert or update or delete
on public.training_answers
for each row
execute function public.trg_archive_training_answer();


-- ============================================================
-- Causal learning + learning patterns: keep every version too.
-- ============================================================

create or replace function public.trg_archive_ai_agent_causal_memory()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op='INSERT' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'created','causal_memory',new.id::text,to_jsonb(new)
    );
    return new;
  elsif tg_op='UPDATE' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'updated_before','causal_memory',old.id::text,to_jsonb(old)
    );
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'updated_after','causal_memory',new.id::text,to_jsonb(new)
    );
    return new;
  else
    perform public.ai_agent_append_permanent_event(
      old.user_id,null,'deleted','causal_memory',old.id::text,to_jsonb(old)
    );
    return old;
  end if;
end;
$function$;

drop trigger if exists trg_archive_ai_agent_causal_memory
  on public.ai_agent_causal_memory;

create trigger trg_archive_ai_agent_causal_memory
after insert or update or delete
on public.ai_agent_causal_memory
for each row
execute function public.trg_archive_ai_agent_causal_memory();


create or replace function public.trg_archive_ai_agent_learning_pattern()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op='INSERT' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'created','learning_pattern',new.id::text,to_jsonb(new)
    );
    return new;
  elsif tg_op='UPDATE' then
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'updated_before','learning_pattern',old.id::text,to_jsonb(old)
    );
    perform public.ai_agent_append_permanent_event(
      new.user_id,null,'updated_after','learning_pattern',new.id::text,to_jsonb(new)
    );
    return new;
  else
    perform public.ai_agent_append_permanent_event(
      old.user_id,null,'deleted','learning_pattern',old.id::text,to_jsonb(old)
    );
    return old;
  end if;
end;
$function$;

drop trigger if exists trg_archive_ai_agent_learning_pattern
  on public.ai_agent_learning_patterns;

create trigger trg_archive_ai_agent_learning_pattern
after insert or update or delete
on public.ai_agent_learning_patterns
for each row
execute function public.trg_archive_ai_agent_learning_pattern();


-- ============================================================
-- Capture the current member/training state as a permanent snapshot.
-- This gives the AI a durable history of training progress/watch state
-- in addition to the immutable test/conversation events.
-- ============================================================

create or replace function public.save_ai_agent_context_snapshot(
  p_token uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
  event_id uuid;
begin
  select s.user_id, u.member_id
    into uid, mid
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  event_id := public.ai_agent_append_permanent_event(
    uid,
    mid,
    'snapshot',
    'member_training_context',
    null,
    coalesce(p_snapshot,'{}'::jsonb)
  );

  return event_id;
end;
$function$;

revoke all on function public.save_ai_agent_context_snapshot(uuid,jsonb)
  from public,anon,authenticated;

grant execute on function public.save_ai_agent_context_snapshot(uuid,jsonb)
  to anon,authenticated;

-- ============================================================
-- Read permanent memory for the authenticated member/account.
-- Stored history is not deleted by this function; p_limit only
-- controls how much is returned to the AI context for one request.
-- ============================================================

create or replace function public.get_ai_agent_permanent_memory(
  p_token uuid,
  p_limit integer default 120
)
returns table(
  event_type text,
  entity_type text,
  entity_id text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
  lim integer := greatest(1,least(coalesce(p_limit,120),500));
begin
  select s.user_id, u.member_id
    into uid, mid
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select
    e.event_type,
    e.entity_type,
    e.entity_id,
    e.payload,
    e.created_at
  from public.ai_agent_permanent_memory_events e
  where e.user_id=uid
     or (mid is not null and e.member_id=mid)
  order by e.created_at desc
  limit lim;
end;
$function$;


revoke all on function public.get_ai_agent_permanent_memory(uuid,integer)
from public,anon,authenticated;

grant execute on function public.get_ai_agent_permanent_memory(uuid,integer)
to anon,authenticated;


-- ============================================================
-- IMPORTANT:
-- Remove the previous 48-message pruning behavior.
-- Conversation rows remain in ai_agent_messages permanently.
-- ============================================================

create or replace function public.save_ai_agent_message(
  p_token uuid,
  p_role text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
begin
  uid := public.app_current_user_id(p_token);

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if p_role not in ('user','assistant') then
    raise exception 'دور الرسالة غير صالح';
  end if;

  if trim(coalesce(p_content,''))='' then
    raise exception 'محتوى الرسالة فارغ';
  end if;

  insert into public.ai_agent_messages(user_id,role,content)
  values(
    uid,
    p_role,
    left(trim(p_content),6000)
  )
  returning id into mid;

  -- لا يوجد DELETE هنا.
  -- الرسائل تبقى محفوظة ولا يوجد حد زمني للذاكرة.

  return mid;
end;
$function$;

revoke all on function public.save_ai_agent_message(uuid,text,text)
from public,anon,authenticated;

grant execute on function public.save_ai_agent_message(uuid,text,text)
to anon,authenticated;


-- ============================================================
-- The old real-delete operation for member training answers is
-- intentionally converted to preservation-only behavior.
-- Existing UI calls remain valid, but no training answer is deleted.
-- ============================================================

create or replace function public.leader_delete_member_training_answers(
  p_token uuid,
  p_member_id uuid,
  p_lesson_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  s record;
  preserved_count integer := 0;
begin
  select au.id as user_id, au.role
    into s
  from public.sessions ss
  join public.app_users au on au.id=ss.user_id
  where ss.token=p_token
    and ss.expires_at>now()
    and au.active=true
  limit 1;

  if not found or s.role<>'leader' then
    raise exception using errcode='P0001',message='غير مصرح للقائد';
  end if;

  select count(*)
    into preserved_count
  from public.training_answers ta
  join public.training_questions q on q.id=ta.question_id
  where ta.member_id=p_member_id
    and q.lesson_no=p_lesson_no;

  return jsonb_build_object(
    'ok',true,
    'deleted_count',0,
    'preserved_count',preserved_count,
    'message','تم الحفاظ على جميع إجابات ومحاولات التدريب. الحذف النهائي معطل.'
  );
end;
$function$;

notify pgrst, 'reload schema';

-- The internal append helper is not a browser RPC.
revoke all on function public.ai_agent_append_permanent_event(uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated;

-- Backfill the currently retained history once. Older records already removed
-- by previous retention logic cannot be reconstructed from the database.
insert into public.ai_agent_permanent_memory_events(user_id,member_id,event_type,entity_type,entity_id,payload,created_at)
select m.user_id,null,'created','ai_agent_message',m.id::text,to_jsonb(m),m.created_at
from public.ai_agent_messages m
where not exists (
  select 1 from public.ai_agent_permanent_memory_events e
  where e.entity_type='ai_agent_message' and e.entity_id=m.id::text and e.event_type='created'
);

insert into public.ai_agent_permanent_memory_events(user_id,member_id,event_type,entity_type,entity_id,payload,created_at)
select au.id,ta.member_id,'created','training_answer',ta.id::text,to_jsonb(ta),ta.created_at
from public.training_answers ta
left join lateral (
  select u.id from public.app_users u
  where u.member_id=ta.member_id and u.active=true
  order by u.created_at asc limit 1
) au on true
where not exists (
  select 1 from public.ai_agent_permanent_memory_events e
  where e.entity_type='training_answer' and e.entity_id=ta.id::text and e.event_type='created'
);

insert into public.ai_agent_permanent_memory_events(user_id,member_id,event_type,entity_type,entity_id,payload,created_at)
select c.user_id,null,'created','causal_memory',c.id::text,to_jsonb(c),c.created_at
from public.ai_agent_causal_memory c
where not exists (
  select 1 from public.ai_agent_permanent_memory_events e
  where e.entity_type='causal_memory' and e.entity_id=c.id::text and e.event_type='created'
);

insert into public.ai_agent_permanent_memory_events(user_id,member_id,event_type,entity_type,entity_id,payload,created_at)
select l.user_id,null,'created','learning_pattern',l.id::text,to_jsonb(l),l.created_at
from public.ai_agent_learning_patterns l
where not exists (
  select 1 from public.ai_agent_permanent_memory_events e
  where e.entity_type='learning_pattern' and e.entity_id=l.id::text and e.event_type='created'
);

-- ============================================================
-- DXN durable knowledge categories
-- These are append-only curated facts. New/updated knowledge must
-- be added as a new record; existing rows are never modified/deleted.
-- ============================================================

insert into public.ai_agent_knowledge(
  scope,category,title,content,priority,source
)
select *
from (
  values

  (
    'global',
    'dxn_recruitment',
    'الاستقطاب',
    'المعرفة المتعلقة بالاستقطاب في DXN جزء من الذاكرة الدائمة للمدرب. عند تعلم أسلوب أو نتيجة جديدة في الاستقطاب، تُضاف كمعلومة جديدة مرتبطة بالتجربة، ولا تُحذف المعرفة السابقة.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_invitation',
    'فن الدعوة وفتح الحوار',
    'المعرفة المتعلقة بفنون الدعوة وفتح الحوار وبدايات المحادثة مع المرشحين في DXN جزء من الذاكرة الدائمة. التصحيحات والتطويرات تُضاف كسجلات جديدة ولا تستبدل السجل التاريخي.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_followup',
    'المتابعة',
    'طرق المتابعة، نتائج التجارب، الرسائل التي نجحت أو لم تنجح، وأساليب متابعة المرشحين والأعضاء يجب حفظها كتجارب تعلمية دائمة. لا تُمحى التجارب السابقة عند ظهور أسلوب أحدث.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_conversation',
    'المحادثات والحوارات',
    'حوارات التدريب، الأمثلة، الاعتراضات، الردود، السيناريوهات والتصحيحات التعليمية المرتبطة بالعمل في DXN تُحفظ ضمن الذاكرة الدائمة عندما تكون ذات قيمة تعليمية، مع تمييز الوقائع عن الاقتراحات.',
    95,
    'durable_policy'
  ),

  (
    'global',
    'dxn_income',
    'نظام الأرباح والعمولات',
    'معلومات مصادر الدخل والعمولات والعلاوات والحوافز في DXN يجب حفظها من المصادر المعتمدة. لا يجوز للمدرب تغيير معلومة قديمة لمجرد ظهور تفسير جديد؛ التحديث يضاف كسجل أحدث مرتبط بالمصدر.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_ranks',
    'المراتب والمستويات',
    'معلومات الرتب والمستويات وشروط التأهل في DXN تحفظ ضمن المعرفة الدائمة مع مصدرها. أي تحديث لاحق يضاف كسجل أحدث، بينما يبقى التاريخ القديم محفوظًا.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_members_registry',
    'سجل أعضاء DXN وأرقام العضويات',
    'سجل dxn_team_members هو المرجع التشغيلي الحالي لأعضاء DXN وأرقام عضوياتهم. كل مزامنة جديدة تحدّث الحالة الحالية، بينما تُحفظ نسخ التغييرات في الأرشيف الدائم ولا تُحذف الأرقام من التاريخ.',
    100,
    'durable_policy'
  ),

  (
    'global',
    'dxn_pv_sv',
    'النقاط والمصطلحات',
    'مصطلحات PV وSV وPPV وPSV وPGPV وPGSV وDGPV وDGSV وشروط استخدامها تحفظ كمعرفة دائمة من المصدر المعتمد ولا تُستبدل بتخمينات.',
    100,
    'durable_policy'
  )

) as seed(scope,category,title,content,priority,source)
where not exists (
  select 1
  from public.ai_agent_knowledge k
  where k.scope=seed.scope
    and k.title=seed.title
);

-- Seed the currently approved DXN marketing-plan facts into durable knowledge.
insert into public.ai_agent_knowledge(
  scope,category,title,content,priority,source
)
select
  'global',
  'dxn_marketing_plan',
  x.title,
  x.content,
  100,
  'dxn_marketing_plan_curated'
from (
  values
  (
    'مصادر الدخل في خطة DXN',
    'المصدر المرجعي الحالي لخطة DXN يعرض ثلاثة مصادر للدخل: المشتريات الشخصية (استثمار الاستهلاك)، المبيعات الشخصية، وعمل المجموعة من خلال فريق العمل.'
  ),
  (
    'فلسفة التسويق وبناء الفريق',
    'المصدر المرجعي الحالي يشرح التسويق على أساس استخدام المنتجات، مشاركة الآخرين فوائد المنتجات، ثم استقطاب من لديهم رغبة بالعمل، وتعليمهم ومتابعتهم، مع استخدام التزكية والتدريب وبناء الفريق.'
  ),
  (
    'مصطلحات PV وSV',
    'PV هي القيمة النقطية للمنتج، وSV هي قيمة المبيعات للنقاط. وتختلف العلاقة بين PV وSV حسب المنتج والدولة وعوامل مثل السعر والحجم والشحن والجمارك؛ لذلك لا تُستنتج الأسعار من النقاط وحدها.'
  ),
  (
    'مصطلحات PPV وPSV',
    'PPV هي مجموع النقاط الناتجة عن فواتير المشتريات الشخصية للعضو خلال الشهر، وPSV هي قيمة المبيعات المقابلة لهذه النقاط.'
  ),
  (
    'مصطلحات PGPV وPGSV',
    'PGPV هي مجموع نقاط المشتريات الشهرية للعضو ولكافة الموزعين في مجموعته باستثناء أي وكيل نجم مؤهل، وPGSV هي قيمة المبيعات المقابلة.'
  ),
  (
    'مصطلحات DGPV وDGSV',
    'DGPV هي مجموع نقاط المشتريات الشهرية للعضو ولكافة الموزعين والنجوم في مجموعته باستثناء أي نجم ماسي مؤهل، وDGSV هي قيمة المبيعات المقابلة.'
  ),
  (
    'مستويات DXN',
    'المصدر يعرض تسلسلًا من الموزع المستقل إلى وكيل النجم المؤهل SA ثم النجم الياقوتي SR ثم النجم الماسي المؤهل QSD ومستويات أعلى نحو السفير الملكي، وفق الجداول وشروط التأهل الواردة في المصدر.'
  ),
  (
    'علاوة المجموعة',
    'المصدر المرجعي يعرض علاوة مجموعة مرتبطة بمستويات النقاط التراكمية، ومنها 100 PV = 6%، 300 PV = 9%، 1000 PV = 12%، 2000 PV = 15%، 3250 PV = 18%، و4500 PV فأعلى وفق الحالة المبينة في المصدر.'
  ),
  (
    'الحوافز والعلاوات',
    'المصدر المرجعي يعرض أرباح بيع التجزئة بنسبة 15-30%، وعلاوة المجموعة من 6-21%، وعلاوة المجموعة النجمية من 25-37%، وعلاوة التطوير بإجمالي 15% موزعة حسب المستويات، وعلاوة القيادة الماسية وفق المستويات المبينة في المصدر، إضافة إلى حوافز محددة كما وردت في الملف.'
  ),
  (
    'شروط QSA',
    'وفق المصدر المرجعي: المحافظة على 300 PGPV في المجموعة الشخصية، على أن يكون منها 100 نقطة على الأقل تحت رقم العضوية، وفق شروط المصدر.'
  ),
  (
    'شروط QSD',
    'وفق المصدر المرجعي: المحافظة على 300 PGPV في المجموعة الشخصية منها 100 نقطة على الأقل تحت رقم العضوية، ثم تحقيق 2500 DGPV مع 4 QSA في خطوط مختلفة أو 5000 DGPV دون QSA، وفق الجدول في المصدر.'
  ),
  (
    'قاعدة عدم ضمان الأرباح',
    'معلومات العمولات والحوافز لا تعني دخلًا مضمونًا أو توقعًا شخصيًا للربح. يجب نقل الشروط كما وردت في المصدر وعدم تحويل النسب إلى وعد مالي.'
  )
) as x(title,content)
where not exists (
  select 1
  from public.ai_agent_knowledge k
  where k.scope='global'
    and k.category='dxn_marketing_plan'
    and k.title=x.title
);

notify pgrst, 'reload schema';
