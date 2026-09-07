-- لعبة تحديات DXN V30 - قاعدة البيانات المركزية Supabase/PostgreSQL
create extension if not exists pgcrypto;

drop view if exists public.team_stats;

drop view if exists public.member_stats;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_no text not null unique,
  name text not null,
  team_id uuid references public.teams(id) on delete set null,
  stars integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  login_no text not null unique,
  pin_hash text not null,
  role text not null check (role in ('leader','member')),
  member_id uuid unique references public.members(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  description text not null default '',
  stars integer not null default 0 check (stars >= 0),
  repeat_rule text not null default 'مرة واحدة',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  proof text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_stars integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null
);

create table if not exists public.monthly_questions (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  question_no integer not null check (question_no between 1 and 5),
  text text not null,
  category text not null default 'الوعي والتفاعل',
  active boolean not null default true,
  unique(month_key, question_no)
);

create table if not exists public.question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.monthly_questions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  answer text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reward_stars integer not null default 1,
  unique(question_id, member_id)
);

create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  month_key text not null,
  dxn_points integer not null default 0,
  target integer not null default 100,
  achieved boolean not null default false,
  reward_awarded boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(member_id, month_key)
);

create table if not exists public.star_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  stars integer not null,
  reason text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_sub_member on public.challenge_submissions(member_id);
create index if not exists idx_sub_challenge on public.challenge_submissions(challenge_id);
create index if not exists idx_qanswers_member on public.question_answers(member_id);
create index if not exists idx_targets_month on public.monthly_targets(month_key);

create or replace view public.member_stats as
select m.id,m.member_no,m.name,m.team_id,m.stars,m.active,t.name team_name,
       count(cs.id) filter (where cs.status='approved') as approved_challenges
from public.members m
left join public.teams t on t.id=m.team_id
left join public.challenge_submissions cs on cs.member_id=m.id
group by m.id,t.name;

create or replace view public.team_stats as
select t.id,t.name,
       count(distinct m.id) filter (where m.active) as members,
       coalesce(sum(m.stars) filter (where m.active),0) as stars,
       count(cs.id) filter (where cs.status='approved') as approved_challenges
from public.teams t
left join public.members m on m.team_id=t.id
left join public.challenge_submissions cs on cs.member_id=m.id
group by t.id;

-- RLS: لا نعطي العميل وصولاً مباشراً للبيانات الحساسة. التطبيق يستخدم RPC فقط.
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.app_users enable row level security;
alter table public.sessions enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.monthly_questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.star_ledger enable row level security;

create or replace function public.current_user_id(p_token uuid)
returns uuid language sql security definer set search_path=public as $$
  select s.user_id from public.sessions s
  where s.token=p_token and s.expires_at>now();
$$;

create or replace function public.current_role(p_token uuid)
returns text language sql security definer set search_path=public as $$
  select u.role from public.sessions s join public.app_users u on u.id=s.user_id
  where s.token=p_token and s.expires_at>now() and u.active;
$$;

create or replace function public.login(p_login_no text,p_pin text)
returns json language plpgsql security definer set search_path=public as $$
declare u public.app_users; s uuid; m public.members; t public.teams;
begin
  select * into u from app_users where login_no=trim(p_login_no) and active;
  if u.id is null or crypt(p_pin,u.pin_hash)<>u.pin_hash then
    raise exception 'بيانات الدخول غير صحيحة';
  end if;
  insert into sessions(user_id) values(u.id) returning token into s;
  if u.member_id is not null then
    select * into m from members where id=u.member_id;
    select * into t from teams where id=m.team_id;
  end if;
  return json_build_object('token',s,'role',u.role,'user_id',u.id,
    'member',case when m.id is null then null else json_build_object('id',m.id,'member_no',m.member_no,'name',m.name,'team_id',m.team_id,'team_name',t.name,'stars',m.stars) end);
end $$;

create or replace function public.logout(p_token uuid)
returns void language sql security definer set search_path=public as $$ delete from sessions where token=p_token; $$;

create or replace function public.bootstrap(p_token uuid)
returns json language plpgsql security definer set search_path=public as $$
declare r text; uid uuid; memberid uuid; mk text:=to_char(current_date,'YYYY-MM');
begin
  r:=current_role(p_token); uid:=current_user_id(p_token); if r is null then raise exception 'انتهت الجلسة'; end if;
  if r='member' then select member_id into memberid from app_users where id=uid; end if;
  return json_build_object(
   'role',r,
   'teams',(select coalesce(json_agg(x order by x.name),'[]'::json) from team_stats x),
   'members',(select coalesce(json_agg(x order by x.stars desc,x.name),'[]'::json) from member_stats x where r='leader' or x.id=memberid),
   'challenges',(select coalesce(json_agg(c order by c.type,c.created_at),'[]'::json) from challenges c where c.active),
   'questions',(select coalesce(json_agg(q order by q.question_no),'[]'::json) from monthly_questions q where q.month_key=mk and q.active),
   'my_answers',(select coalesce(json_agg(a),'[]'::json) from question_answers a join monthly_questions q on q.id=a.question_id where q.month_key=mk and (r='leader' or a.member_id=memberid)),
   'my_submissions',(select coalesce(json_agg(s),'[]'::json) from challenge_submissions s where r='leader' or s.member_id=memberid),
   'monthly',(select coalesce(json_agg(mt),'[]'::json) from monthly_targets mt where r='leader' or mt.member_id=memberid)
  );
end $$;

create or replace function public.submit_challenge(p_token uuid,p_challenge uuid,p_proof text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid; mid uuid; c challenges; sid uuid;
begin
 uid:=current_user_id(p_token); if uid is null or current_role(p_token)<>'member' then raise exception 'غير مصرح'; end if;
 select member_id into mid from app_users where id=uid; select * into c from challenges where id=p_challenge and active;
 if c.id is null then raise exception 'التحدي غير متاح'; end if;
 if trim(coalesce(p_proof,''))='' then raise exception 'أدخل وصف الإنجاز'; end if;
 -- لا نمنع التحديات المتكررة؛ نمنع فقط وجود طلب مماثل قيد الانتظار.
 if exists(select 1 from challenge_submissions where member_id=mid and challenge_id=c.id and status='pending') then raise exception 'لديك إنجاز بانتظار اعتماد القائد'; end if;
 insert into challenge_submissions(member_id,challenge_id,proof,reward_stars) values(mid,c.id,trim(p_proof),c.stars) returning id into sid;
 return sid;
end $$;

create or replace function public.submit_question(p_token uuid,p_question uuid,p_answer text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid; mid uuid; q monthly_questions; aid uuid;
begin
 uid:=current_user_id(p_token); if uid is null or current_role(p_token)<>'member' then raise exception 'غير مصرح'; end if;
 select member_id into mid from app_users where id=uid; select * into q from monthly_questions where id=p_question and active and month_key=to_char(current_date,'YYYY-MM');
 if q.id is null then raise exception 'السؤال غير متاح'; end if;
 if trim(coalesce(p_answer,''))='' then raise exception 'اكتب الإجابة أولاً'; end if;
 if exists(select 1 from question_answers where member_id=mid and question_id=q.id) then raise exception 'أجبت عن هذا السؤال سابقاً'; end if;
 insert into question_answers(question_id,member_id,answer) values(q.id,mid,trim(p_answer)) returning id into aid;
 return aid;
end $$;

create or replace function public.approve_challenge(p_token uuid,p_submission uuid,p_ok boolean)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid; x challenge_submissions; reward integer;
begin
 uid:=current_user_id(p_token); if uid is null or current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 select * into x from challenge_submissions where id=p_submission for update;
 if x.id is null or x.status<>'pending' then raise exception 'الإنجاز غير متاح للمراجعة'; end if;
 update challenge_submissions set status=case when p_ok then 'approved' else 'rejected' end, reviewed_at=now(), reviewed_by=uid where id=x.id;
 if p_ok then reward:=x.reward_stars; update members set stars=stars+reward where id=x.member_id; insert into star_ledger(member_id,stars,reason,source_id) values(x.member_id,reward,'اعتماد تحدي',x.id); end if;
end $$;

create or replace function public.approve_question(p_token uuid,p_answer uuid,p_ok boolean)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid; x question_answers;
begin
 uid:=current_user_id(p_token); if uid is null or current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 select * into x from question_answers where id=p_answer for update;
 if x.id is null or x.status<>'pending' then raise exception 'الإجابة غير متاحة للمراجعة'; end if;
 update question_answers set status=case when p_ok then 'approved' else 'rejected' end, reviewed_at=now(), reviewed_by=uid where id=x.id;
 if p_ok then update members set stars=stars+1 where id=x.member_id; insert into star_ledger(member_id,stars,reason,source_id) values(x.member_id,1,'اعتماد سؤال شهري',x.id); end if;
end $$;

create or replace function public.set_monthly_points(p_token uuid,p_member uuid,p_points integer)
returns void language plpgsql security definer set search_path=public as $$
declare mk text:=to_char(current_date,'YYYY-MM');
begin
 if current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 insert into monthly_targets(member_id,month_key,dxn_points,achieved) values(p_member,mk,greatest(p_points,0),p_points>=100)
 on conflict(member_id,month_key) do update set dxn_points=greatest(excluded.dxn_points,0),achieved=excluded.dxn_points>=100,updated_at=now();
end $$;

create or replace function public.award_monthly_target(p_token uuid,p_member uuid)
returns void language plpgsql security definer set search_path=public as $$
declare mk text:=to_char(current_date,'YYYY-MM'); r monthly_targets;
begin
 if current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 select * into r from monthly_targets where member_id=p_member and month_key=mk for update;
 if r.id is null or r.dxn_points<r.target then raise exception 'العضو لم يحقق التارجت'; end if;
 if not r.reward_awarded then update monthly_targets set reward_awarded=true,updated_at=now() where id=r.id; update members set stars=stars+100 where id=p_member; insert into star_ledger(member_id,stars,reason,source_id) values(p_member,100,'مكافأة تحقيق 100 نقطة DXN شهرياً',r.id); end if;
end $$;



create or replace function public.create_team(p_token uuid,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare x uuid;
begin
 if current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 insert into teams(name) values(trim(p_name)) returning id into x; return x;
end $$;

create or replace function public.create_member(p_token uuid,p_member_no text,p_name text,p_pin text,p_team uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare x uuid;
begin
 if current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 if length(trim(p_pin))<4 then raise exception 'PIN يجب أن يكون 4 أرقام على الأقل'; end if;
 insert into members(member_no,name,team_id) values(trim(p_member_no),trim(p_name),p_team) returning id into x;
 insert into app_users(login_no,pin_hash,role,member_id) values(trim(p_member_no),crypt(trim(p_pin),gen_salt('bf')),'member',x);
 return x;
exception when unique_violation then raise exception 'رقم العضوية مستخدم مسبقاً';
end $$;

create or replace function public.save_month_questions(p_token uuid,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb; mk text:=to_char(current_date,'YYYY-MM'); n int;
begin
 if current_role(p_token)<>'leader' then raise exception 'صلاحية القائد فقط'; end if;
 if jsonb_array_length(p_items)<>5 then raise exception 'يجب حفظ خمسة أسئلة بالضبط'; end if;
 delete from monthly_questions where month_key=mk;
 for item in select * from jsonb_array_elements(p_items) loop
   n:=coalesce((item->>'question_no')::int,0);
   if n<1 or n>5 then raise exception 'ترقيم الأسئلة يجب أن يكون من 1 إلى 5'; end if;
   insert into monthly_questions(month_key,question_no,text,category) values(mk,n,trim(item->>'text'),coalesce(nullif(trim(item->>'category'),''),'الوعي والتفاعل'));
 end loop;
end $$;

create or replace function public.change_pin(p_token uuid,p_new_pin text)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
 uid:=current_user_id(p_token); if uid is null then raise exception 'انتهت الجلسة'; end if;
 if length(trim(p_new_pin))<4 then raise exception 'PIN قصير جداً'; end if;
 update app_users set pin_hash=crypt(trim(p_new_pin),gen_salt('bf')) where id=uid;
end $$;

-- إنشاء حساب القائد الأول: غيّر الرقم والـPIN قبل التشغيل إذا رغبت.
insert into public.app_users(login_no,pin_hash,role)
values('LEADER',crypt('123456',gen_salt('bf')),'leader')
on conflict(login_no) do nothing;

insert into public.teams(name) values('فريق الطموح'),('فريق القمة'),('فريق الإنجاز') on conflict(name) do nothing;

insert into public.challenges(type,title,description,stars,repeat_rule) values
('الاستهلاك','استهلاك اليوم','استخدم منتجاً واحداً على الأقل من منتجات DXN اليوم وفق طريقة الاستخدام الموصى بها على المنتج.',5,'يومي'),
('الاستهلاك','استمرارية 7 أيام','أكمل استهلاكك اليومي وفق تعليمات المنتجات لمدة 7 أيام متتالية.',35,'أسبوعي'),
('الاستهلاك','استمرارية 14 يوماً','أكمل استهلاكك اليومي وفق تعليمات المنتجات لمدة 14 يوماً متتالية.',75,'أسبوعي'),
('الاستهلاك','استمرارية الشهر','حافظ على استهلاكك اليومي وفق تعليمات المنتجات طوال أيام الشهر المستهدفة.',150,'شهري'),
('الاستقطاب','تواصل جديد','ابدأ محادثة حقيقية مع شخص جديد مناسب للتعرف إلى اهتمامه بالمشروع.',10,'يومي'),
('الاستقطاب','ثلاثة تواصلات','أنجز 3 محادثات حقيقية مع أشخاص جدد حول المشروع خلال الأسبوع.',30,'أسبوعي'),
('الاستقطاب','خمسة تواصلات','أنجز 5 محادثات حقيقية مع أشخاص جدد حول المشروع خلال الأسبوع.',50,'أسبوعي'),
('الاستقطاب','عرض المشروع','قدّم شرحاً واضحاً للمشروع لشخص مهتم بعد التأكد من اهتمامه.',25,'مرة واحدة'),
('الاستقطاب','متابعة مهتم','تابع شخصاً سبق أن أبدى اهتماماً بالمشروع بخطوة واضحة ومهنية.',15,'يومي'),
('الاستقطاب','ثلاث متابعات','أنجز 3 متابعات فعلية لأشخاص مهتمين خلال الأسبوع.',40,'أسبوعي'),
('التوسع وبناء الفريق','عضو جديد','ساهم في تسجيل عضو جديد بعد تعريفه بالمشروع بشكل واضح.',100,'مرة واحدة'),
('التوسع وبناء الفريق','عضوان جديدان','ساهم في تسجيل عضوين جديدين خلال فترة التحدي.',200,'مرة واحدة'),
('التوسع وبناء الفريق','ثلاثة أعضاء جدد','ساهم في تسجيل 3 أعضاء جدد خلال فترة التحدي.',300,'مرة واحدة'),
('التوسع وبناء الفريق','خمسة أعضاء جدد','ساهم في تسجيل 5 أعضاء جدد خلال فترة التحدي.',500,'مرة واحدة'),
('التوسع وبناء الفريق','دعوة إلى شرح','وجّه شخصاً مهتماً إلى جلسة شرح أو تعريف بالمشروع.',20,'أسبوعي'),
('التوسع وبناء الفريق','اصطحاب مهتم','اصطحب شخصاً مهتماً إلى لقاء أو فعالية بهدف التعرف إلى المشروع.',30,'مرة واحدة'),
('تفعيل العضو الجديد','تدريب البداية','أكمل تدريب العضو الجديد على خطوات البداية الأساسية للمشروع.',30,'مرة واحدة'),
('تفعيل العضو الجديد','أول نشاط للعضو','ساعد العضو الجديد على تنفيذ أول نشاط عملي له في المشروع.',40,'مرة واحدة'),
('تفعيل العضو الجديد','متابعة 7 أيام','أكمل متابعة فعلية للعضو الجديد لمدة 7 أيام وساعده على تنفيذ خطواته الأولى.',60,'مرة واحدة'),
('تفعيل العضو الجديد','عضو جديد فعّال','ساعد عضواً جديداً على إكمال خطوات البداية وتنفيذ نشاط فعلي.',75,'مرة واحدة'),
('التارجت','تحقيق 100 نقطة','حقق 100 نقطة DXN خلال الشهر وفق نظام التارجت المعتمد، ثم يراجع القائد الإنجاز.',100,'شهري'),
('التارجت','تحقيق 200 نقطة','حقق 200 نقطة DXN خلال الشهر وفق نظام التارجت المعتمد، ثم يراجع القائد الإنجاز.',200,'شهري'),
('التارجت','تحقيق التارجت مبكراً','حقق هدف 100 نقطة DXN قبل نهاية الشهر، ثم يراجع القائد الإنجاز.',125,'شهري'),
('نمو الفريق','عضوان يحققان التارجت','حقق عضوان من فريقك هدف 100 نقطة DXN الشهري.',75,'شهري'),
('نمو الفريق','خمسة أعضاء يحققون التارجت','حقق 5 أعضاء من فريقك هدف 100 نقطة DXN الشهري.',200,'شهري')
;

insert into public.monthly_questions(month_key,question_no,text,category) values
(to_char(current_date,'YYYY-MM'),1,'ما الخطوة الأهم قبل أن تقدم المشروع لشخص جديد؟','الاستقطاب'),
(to_char(current_date,'YYYY-MM'),2,'لماذا تعتبر المتابعة جزءاً أساسياً من العمل؟','المتابعة'),
(to_char(current_date,'YYYY-MM'),3,'ما أول 3 خطوات ستقوم بها مع عضو جديد انضم إلى فريقك؟','التدريب'),
(to_char(current_date,'YYYY-MM'),4,'ما أفضل طريقة للاستفادة من محاضرة؟','المحاضرات'),
(to_char(current_date,'YYYY-MM'),5,'كيف تقيس نجاحك في أسبوع دون الاعتماد على المبيعات فقط؟','القيادة')
on conflict(month_key,question_no) do nothing;

-- منع الوصول المباشر للـAPI إلى الجداول؛ RPCs أعلاه هي واجهة التطبيق.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
