# خطة النسخ الاحتياطي والتراجع — `20261011120000_ragwan_leader_trainer_access.sql`

> قاعدة بيانات Preview هي نفسها Production (`ryqpstkzppaifpvhezzn`). أي تطبيق يؤثر على المستخدمين فورًا.

## قبل التطبيق (إلزامي)

1. **احفظ التعريفات الحالية من Supabase نفسه** (هذا هو مصدر التراجع، وليس ملفات المستودع):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('ragwan_current_sponsor','add_ragwan_trainee_by_member_no','search_ragwan_trainees','ragwan_current_trainer_root_no');
   ```
   احفظ الناتج كاملًا في ملف خارج المستودع.

2. **احفظ الصلاحيات الحالية:**
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proacl
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('ragwan_current_sponsor','add_ragwan_trainee_by_member_no','search_ragwan_trainees');
   ```

3. **لقطة أعداد** (تُعاد بعد التطبيق ويجب أن تتطابق):
   ```sql
   select
     (select count(*) from public.ragwan_training_enrollments) as enrollments,
     (select count(*) from public.ragwan_training_enrollments where archived_at is null) as active_enrollments,
     (select count(*) from public.ragwan_training_progress) as progress_rows,
     (select count(*) from public.ragwan_training_progress where status='completed') as completed_steps,
     (select count(*) from public.ragwan_training_enrollments where completed_at is not null) as completed_plans,
     (select count(*) from public.members) as members,
     (select count(*) from public.members where active) as active_members;
   ```

4. **صدّر نسخة CSV** من `ragwan_training_enrollments` و `ragwan_training_progress` من Table Editor، وتأكد من وجود Backup حديث في Database → Backups.

5. **قارن** ناتج الخطوة 1 بالملف. أي اختلاف في `add_ragwan_trainee_by_member_no` عن النسخة التي بُني عليها الملف يجب نقله إلى الملف قبل التطبيق.

## التطبيق
- من SQL Editor في وقت استخدام منخفض. الملف داخل `begin … commit`، فإما يُطبَّق كاملًا أو لا شيء.

## بعد التطبيق مباشرة
1. أعد استعلام الأعداد (الخطوة 3) — يجب أن يكون مطابقًا.
2. عضو: افتح خطة رجوان، اختر متدربًا موجودًا وتأكد من ظهور تقدمه كما هو.
3. القائد: أضف متدربًا من فريقه، اختره، سجّل بداية خطوة.
4. تحقق من الصلاحيات:
   ```sql
   select has_function_privilege('anon','public.search_ragwan_trainees(uuid,text)','execute') as anon_search,
          has_function_privilege('anon','public.ragwan_current_sponsor(uuid)','execute') as anon_sponsor,
          has_function_privilege('service_role','public.search_ragwan_trainees(uuid,text)','execute') as server_search;
   -- المتوقع: false, false, true
   ```

## التراجع
لا يحتاج استعادة بيانات؛ الملف لا يغيّر أي صف عند التطبيق.

1. شغّل التعريفات المحفوظة في الخطوة 1 لـ `ragwan_current_sponsor` و `add_ragwan_trainee_by_member_no`.
2. أعد صلاحياتها كما حُفظت في الخطوة 2 (مثال إن كانت متاحة لـ anon و authenticated):
   ```sql
   grant execute on function public.ragwan_current_sponsor(uuid) to anon, authenticated;
   ```
3. احذف ما أنشأه الملف ولم يكن موجودًا قبله:
   ```sql
   drop function if exists public.ragwan_current_trainer_root_no(uuid);
   -- فقط إذا أكدت الخطوة 1 أن search_ragwan_trainees لم تكن موجودة:
   drop function if exists public.search_ragwan_trainees(uuid,text);
   notify pgrst, 'reload schema';
   ```
4. أعد استعلام الأعداد للتأكد.

> ملاحظة: إذا أضاف القائد متدربين بعد التطبيق ثم حدث التراجع، تبقى سجلاتهم محفوظة في الجداول لكن لن يستطيع القائد فتحها حتى يُعاد تطبيق الملف. لا يُحذف شيء.
