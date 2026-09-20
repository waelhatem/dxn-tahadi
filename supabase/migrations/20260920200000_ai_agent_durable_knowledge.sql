-- Durable shared knowledge for المدرب وائل حاتم.
-- Unlike conversation memory, these entries are not tied to one member account
-- and are not limited to the last 48 messages.

create table if not exists public.ai_agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global'
    check (scope in ('global','leader','member')),
  category text not null default 'platform',
  title text not null,
  content text not null,
  priority integer not null default 50,
  active boolean not null default true,
  source text not null default 'curated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_knowledge_active_idx
  on public.ai_agent_knowledge(scope, active, priority desc, updated_at desc);

alter table public.ai_agent_knowledge enable row level security;

create or replace function public.get_ai_agent_knowledge(
  p_token uuid,
  p_limit integer default 40
)
returns table(
  id uuid,
  scope text,
  category text,
  title text,
  content text,
  priority integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  role_name text;
  lim integer := greatest(1, least(coalesce(p_limit,40),100));
begin
  select lower(u.role)
    into role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if role_name is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select
    k.id,
    k.scope,
    k.category,
    k.title,
    k.content,
    k.priority,
    k.updated_at
  from public.ai_agent_knowledge k
  where k.active=true
    and (k.scope='global' or k.scope=role_name)
  order by k.priority desc, k.updated_at desc
  limit lim;
end;
$function$;

create or replace function public.save_ai_agent_knowledge(
  p_token uuid,
  p_scope text,
  p_category text,
  p_title text,
  p_content text,
  p_priority integer default 50,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  role_name text;
  new_id uuid;
  sc text := lower(trim(coalesce(p_scope,'global')));
begin
  select s.user_id, lower(u.role)
    into uid, role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null or role_name<>'leader' then
    raise exception 'هذه العملية متاحة للقائد فقط';
  end if;

  if sc not in ('global','leader','member') then sc:='global'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'عنوان المعرفة مطلوب'; end if;
  if nullif(trim(coalesce(p_content,'')),'') is null then raise exception 'محتوى المعرفة مطلوب'; end if;

  insert into public.ai_agent_knowledge(
    scope,category,title,content,priority,active,source,updated_at
  )
  values(
    sc,
    left(trim(coalesce(p_category,'platform')),120),
    left(trim(p_title),300),
    left(trim(p_content),4000),
    greatest(0,least(coalesce(p_priority,50),100)),
    coalesce(p_active,true),
    'leader_curated',
    now()
  )
  returning id into new_id;

  return new_id;
end;
$function$;

revoke all on function public.get_ai_agent_knowledge(uuid,integer)
  from public, anon, authenticated;
revoke all on function public.save_ai_agent_knowledge(uuid,text,text,text,text,integer,boolean)
  from public, anon, authenticated;

grant execute on function public.get_ai_agent_knowledge(uuid,integer)
  to anon, authenticated;
grant execute on function public.save_ai_agent_knowledge(uuid,text,text,text,text,integer,boolean)
  to anon, authenticated;

-- Core knowledge that should survive new sessions and deployments.
insert into public.ai_agent_knowledge(scope,category,title,content,priority,source)
select * from (
  values
  ('global','identity','هوية المدرب',
   'هوية الوكيل داخل منصة مجتمع الصحة والثراء هي: المدرب وائل حاتم. لا يعود إلى اسم محمد في واجهة المستخدم أو عند تعريف نفسه.',100,'curated'),
  ('global','platform','اسم المنصة',
   'اسم المنصة هو مجتمع الصحة والثراء. المدرب وائل حاتم يعمل داخل هذه المنصة لمساندة القائد والأعضاء.',100,'curated'),
  ('global','team','سجل فريق DXN',
   'سجل dxn_team_members هو سجل DXN الرئيسي المتزامن من تقرير DXN الذي يرفعه القائد. رقم العضوية هو المفتاح الثابت لبناء علاقات الفريق.',100,'curated'),
  ('global','team','مصدر بيانات الفريق',
   'عند الأسئلة عن فريق DXN أو الأجيال أو الخطوط أو PV، استخدم Team Intelligence وبيانات dxn_team_members الفعلية ولا تخمّن الأرقام.',100,'curated'),
  ('global','training','التدريبات الثمانية',
   'منظومة مجتمع الصحة والثراء تتضمن ثمانية تدريبات. تقدم العضو يجب أن يعكس نسبة المشاهدة الفعلية لكل تدريب، مع تمييز الإكمال الفعلي عن مجرد بدء المشاهدة.',95,'curated'),
  ('global','registration','شرط تسجيل العضو',
   'إنشاء عضوية مجتمع الصحة والثراء للعضو يتطلب وجود رقم عضوية DXN في سجل DXN المتزامن. العضوية غير الموجودة في السجل لا تنتقل إلى إنشاء حساب المجتمع.',100,'curated'),
  ('global','registration','عضوية المجتمع مرة واحدة',
   'رقم عضوية DXN يمكنه إنشاء حساب عضو مجتمع واحد فقط. إذا كان الحساب موجودًا، يتم توجيه العضو إلى تسجيل الدخول بدل إنشاء حساب ثانٍ.',100,'curated'),
  ('global','registration','السجل اليدوي',
   'سجل أعضاء الفريق اليدوي في لوحة القائد يبقى موجودًا ولا يُحذف تلقائيًا. تحقق تسجيل العضو الحالي يعتمد على سجل DXN المتزامن.',95,'curated'),
  ('global','sync','مزامنة تقرير DXN',
   'القائد يحدّث سجل DXN عبر لصق تقرير DXN من Excel في شاشة 📥 مزامنة سجل DXN. المزامنة تضيف الأعضاء الجدد وتحدّث الموجودين ولا تحذف الأعضاء الغائبين من التقرير.',100,'curated'),
  ('global','style','أسلوب المدرب',
   'المدرب وائل حاتم يتحدث بعراقية طبيعية ومفهومة، مباشر وهادئ، ويشرح خطوة واحدة واضحة في كل دور عند الحاجة.',90,'curated')
) as seed(scope,category,title,content,priority,source)
where not exists (
  select 1 from public.ai_agent_knowledge k
  where k.scope=seed.scope and k.title=seed.title
);

notify pgrst, 'reload schema';
