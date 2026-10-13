-- Training 5: electronic counterpart of the three "قوائم الأسماء" forms.
-- Never expose contacts to the leader or to another member.
-- Database changes are intentionally migration-only until separately deployed.
create table if not exists public.training_name_list_contacts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references public.app_users(id) on delete cascade,
 full_name text not null check (char_length(btrim(full_name)) between 1 and 140),
 phone text not null default '' check (char_length(phone) <= 45),
 location text not null default '' check (char_length(location) <= 160),
 nearest_branch text not null default '' check (char_length(nearest_branch) <= 160),
 source text not null default 'other'
   check (source in ('family','neighbors','study','work','community','professions','online','other')),
 tags integer[] not null default '{}'::integer[]
   check (tags <@ array[1,2,4,5,7,8]::integer[]),
 stage text not null default 'new'
   check (stage in ('new','contacted','followup_48h','followup_2','followup_3','trial','consumer','investor','declined')),
 notes text not null default '' check (char_length(notes) <= 1200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists training_name_list_contacts_owner_updated
 on public.training_name_list_contacts(owner_user_id, updated_at desc);

create table if not exists public.training_name_list_followups (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.training_name_list_contacts(id) on delete cascade,
 owner_user_id uuid not null references public.app_users(id) on delete cascade,
 step text not null check (step in ('followup_48h','followup_2','followup_3','trial','consumer','investor','declined')),
 activity_date date not null default current_date,
 notes text not null default '' check (char_length(notes) <= 1200),
 created_at timestamptz not null default now()
);
create index if not exists training_name_list_followups_owner_contact
 on public.training_name_list_followups(owner_user_id, contact_id, activity_date desc);

create table if not exists public.training_name_list_consumption (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.training_name_list_contacts(id) on delete cascade,
 owner_user_id uuid not null references public.app_users(id) on delete cascade,
 product text not null check (char_length(btrim(product)) between 1 and 160),
 consumed_on date not null default current_date,
 notes text not null default '' check (char_length(notes) <= 1200),
 created_at timestamptz not null default now()
);
create index if not exists training_name_list_consumption_owner_contact
 on public.training_name_list_consumption(owner_user_id, contact_id, consumed_on desc);

alter table public.training_name_list_contacts enable row level security;
alter table public.training_name_list_followups enable row level security;
alter table public.training_name_list_consumption enable row level security;
revoke all on table public.training_name_list_contacts from public, anon, authenticated;
revoke all on table public.training_name_list_followups from public, anon, authenticated;
revoke all on table public.training_name_list_consumption from public, anon, authenticated;
-- Deliberately no SELECT/INSERT/UPDATE/DELETE RLS policies for anon:
-- the site uses opaque app sessions, not the Supabase Auth JWT identity.

create or replace function public.training_name_list_read(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
 uid uuid;
begin
 uid := public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users u where u.id=uid and u.active) then
   raise exception 'انتهت الجلسة، أعد تسجيل الدخول';
 end if;
 return jsonb_build_object(
  'contacts', coalesce((
    select jsonb_agg(to_jsonb(c) - 'owner_user_id' order by c.updated_at desc, c.id)
    from public.training_name_list_contacts c where c.owner_user_id=uid
  ), '[]'::jsonb),
  'followups', coalesce((
    select jsonb_agg(to_jsonb(f) - 'owner_user_id' order by f.activity_date desc, f.created_at desc)
    from public.training_name_list_followups f where f.owner_user_id=uid
  ), '[]'::jsonb),
  'consumption', coalesce((
    select jsonb_agg(to_jsonb(p) - 'owner_user_id' order by p.consumed_on desc, p.created_at desc)
    from public.training_name_list_consumption p where p.owner_user_id=uid
  ), '[]'::jsonb)
 );
end;
$$;

create or replace function public.training_name_list_write(p_token uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
 uid uuid;
 cid uuid;
 eid uuid;
 record_id uuid;
 n text;
 phone_value text;
 location_value text;
 branch_value text;
 src text;
 state_value text;
 note_value text;
 step_value text;
 product_value text;
 date_value date;
 tags_value integer[];
 changed integer;
begin
 uid := public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users u where u.id=uid and u.active) then
   raise exception 'انتهت الجلسة، أعد تسجيل الدخول';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'بيانات غير صالحة'; end if;
 if length(p_data::text)>10000 then raise exception 'حجم البيانات كبير جدًا'; end if;

 if p_action='save_contact' then
   cid := nullif(p_data->>'id','')::uuid;
   n := btrim(coalesce(p_data->>'full_name',''));
   phone_value := btrim(coalesce(p_data->>'phone',''));
   location_value := btrim(coalesce(p_data->>'location',''));
   branch_value := btrim(coalesce(p_data->>'nearest_branch',''));
   src := coalesce(nullif(p_data->>'source',''),'other');
   state_value := coalesce(nullif(p_data->>'stage',''),'new');
   note_value := btrim(coalesce(p_data->>'notes',''));
   if char_length(n) not between 1 and 140 or char_length(phone_value)>45 or char_length(location_value)>160 or char_length(branch_value)>160 or char_length(note_value)>1200 then
     raise exception 'تحقق من الاسم والهاتف والملاحظات';
   end if;
   if jsonb_typeof(coalesce(p_data->'tags','[]'::jsonb)) <> 'array' then
     raise exception 'تصنيف المرشح غير صالح';
   end if;
   select coalesce(array_agg(distinct t.value::integer), '{}'::integer[]) into tags_value
     from jsonb_array_elements_text(coalesce(p_data->'tags','[]'::jsonb)) t(value);
   if not (tags_value <@ array[1,2,4,5,7,8]::integer[]) then
     raise exception 'لا يُسمح بتسجيل التصنيفات الصحية أو الديون';
   end if;
   if src not in ('family','neighbors','study','work','community','professions','online','other')
     or state_value not in ('new','contacted','followup_48h','followup_2','followup_3','trial','consumer','investor','declined')
   then raise exception 'نوع التصنيف أو المرحلة غير صالح'; end if;
   if cid is null then
     insert into public.training_name_list_contacts(owner_user_id,full_name,phone,location,nearest_branch,source,tags,stage,notes)
     values(uid,n,phone_value,location_value,branch_value,src,tags_value,state_value,note_value) returning id into record_id;
   else
     update public.training_name_list_contacts set full_name=n,phone=phone_value,location=location_value,nearest_branch=branch_value,source=src,tags=tags_value,
       stage=state_value,notes=note_value,updated_at=now()
     where id=cid and owner_user_id=uid returning id into record_id;
     if record_id is null then raise exception 'الاسم غير موجود في قائمتك'; end if;
   end if;
   return jsonb_build_object('ok',true,'id',record_id);

 elsif p_action='delete_contact' then
   cid := nullif(p_data->>'id','')::uuid;
   delete from public.training_name_list_contacts where id=cid and owner_user_id=uid;
   get diagnostics changed = row_count;
   if changed=0 then raise exception 'الاسم غير موجود في قائمتك'; end if;
   return jsonb_build_object('ok',true);

 elsif p_action in ('save_followup','save_consumption') then
   eid := nullif(p_data->>'id','')::uuid;
   cid := nullif(p_data->>'contact_id','')::uuid;
   if cid is null or not exists(
      select 1 from public.training_name_list_contacts c where c.id=cid and c.owner_user_id=uid
   ) then raise exception 'اختر اسمًا من قائمتك أولًا'; end if;
   note_value := btrim(coalesce(p_data->>'notes',''));
   if char_length(note_value)>1200 then raise exception 'الملاحظات طويلة جدًا'; end if;

   if p_action='save_followup' then
     step_value := coalesce(p_data->>'step','');
     if step_value not in ('followup_48h','followup_2','followup_3','trial','consumer','investor','declined')
       then raise exception 'مرحلة المتابعة غير صالحة'; end if;
     date_value := coalesce(nullif(p_data->>'activity_date','')::date,current_date);
     if date_value < date '2000-01-01' or date_value > current_date+1 then
       raise exception 'تاريخ المتابعة غير صالح'; end if;
     if eid is null then
       insert into public.training_name_list_followups(owner_user_id,contact_id,step,activity_date,notes)
       values(uid,cid,step_value,date_value,note_value) returning id into record_id;
     else
       update public.training_name_list_followups
         set step=step_value,activity_date=date_value,notes=note_value
       where id=eid and owner_user_id=uid and contact_id=cid returning id into record_id;
       if record_id is null then raise exception 'سجل المتابعة غير موجود'; end if;
     end if;
     update public.training_name_list_contacts set stage=step_value,updated_at=now()
       where id=cid and owner_user_id=uid;
   else
     product_value := btrim(coalesce(p_data->>'product',''));
     if char_length(product_value) not between 1 and 160 then
       raise exception 'اسم المنتج مطلوب'; end if;
     date_value := coalesce(nullif(p_data->>'consumed_on','')::date,current_date);
     if date_value < date '2000-01-01' or date_value > current_date+1 then
       raise exception 'تاريخ الاستهلاك غير صالح'; end if;
     if eid is null then
       insert into public.training_name_list_consumption(owner_user_id,contact_id,product,consumed_on,notes)
       values(uid,cid,product_value,date_value,note_value) returning id into record_id;
     else
       update public.training_name_list_consumption
         set product=product_value,consumed_on=date_value,notes=note_value
       where id=eid and owner_user_id=uid and contact_id=cid returning id into record_id;
       if record_id is null then raise exception 'سجل الاستهلاك غير موجود'; end if;
     end if;
   end if;
   return jsonb_build_object('ok',true,'id',record_id);

 elsif p_action='delete_followup' then
   eid := nullif(p_data->>'id','')::uuid;
   delete from public.training_name_list_followups where id=eid and owner_user_id=uid;
   get diagnostics changed=row_count;
   if changed=0 then raise exception 'سجل المتابعة غير موجود'; end if;
   return jsonb_build_object('ok',true);

 elsif p_action='delete_consumption' then
   eid := nullif(p_data->>'id','')::uuid;
   delete from public.training_name_list_consumption where id=eid and owner_user_id=uid;
   get diagnostics changed=row_count;
   if changed=0 then raise exception 'سجل الاستهلاك غير موجود'; end if;
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'عملية غير مدعومة';
end;
$$;
revoke all on function public.training_name_list_read(uuid) from public, anon, authenticated;
revoke all on function public.training_name_list_write(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.training_name_list_read(uuid) to anon, authenticated;
grant execute on function public.training_name_list_write(uuid,text,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
