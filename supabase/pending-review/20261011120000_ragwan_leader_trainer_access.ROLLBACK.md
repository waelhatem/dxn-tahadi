# خطة النسخ الاحتياطي والتراجع — `20261011120000_ragwan_leader_trainer_access.sql`

> قاعدة بيانات Preview هي نفسها Production (`ryqpstkzppaifpvhezzn`). أي تطبيق يؤثر على المستخدمين فورًا.

## قبل التطبيق (إلزامي)

1. **احفظ التعريفات الحالية من Supabase نفسه** (هذا هو مصدر التراجع، وليس ملفات المستودع):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('ragwan_current_sponsor','add_ragwan_trainee_by_member_no','search_ragwan_trainees','ragwan_current_trainer_root_no',
                       'ragwan_leader_can_manage_training','get_ragwan_plan_completions','save_ragwan_success_plan_content');
   ```
   احفظ الناتج كاملًا في ملف خارج المستودع.

2. **احفظ الصلاحيات الحالية:**
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proacl
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('ragwan_current_sponsor','add_ragwan_trainee_by_member_no','search_ragwan_trainees',
                       'get_ragwan_plan_completions','save_ragwan_success_plan_content');
   ```

## ترتيب النشر (مهم)
- الواجهة و `api/ragwan-files.js` في هذا الفرع تسأل قاعدة البيانات عبر `ragwan_leader_can_manage_training`.
  قبل تطبيق الملف لا توجد هذه الدالة، فيعامل الخادم **كل** حسابات القائد كوضع مطالعة (fail closed):
  لا رفع ملفات ولا مراجعة إثباتات للقائد حتى يُطبَّق الملف. العضو لا يتأثر.
- لذلك: طبّق الملف أولًا، تحقق، ثم انشر/ادمج الكود. لا تدمج الكود قبل الملف.

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
5. وضع المطالعة (LEADER1 بلا جذر فريق) — لا يغيّر أي حساب، قراءة فقط:
   ```sql
   select au.username, au.role, au.active, au.team_root_member_no,
          exists(select 1 from public.app_users x where x.id=au.id and x.role='leader' and x.active
                 and coalesce(trim(x.team_root_member_no),'') ~ '^[0-9]{9}$') as can_manage_training
   from public.app_users au where au.role='leader';
   -- المتوقع: LEADER → true، LEADER1 → false
   ```
   ثم بحساب LEADER1: تفتح الخطة والأبواب، ويظهر «وضع المطالعة»، وأي محاولة إضافة/اختيار تُرفض.

## التراجع
لا يحتاج استعادة بيانات؛ الملف لا يغيّر أي صف عند التطبيق.

1. شغّل التعريفات المحفوظة في الخطوة 1 لـ `ragwan_current_sponsor` و `add_ragwan_trainee_by_member_no`
   و `get_ragwan_plan_completions` و `save_ragwan_success_plan_content`.
2. أعد صلاحياتها كما حُفظت في الخطوة 2 (مثال إن كانت متاحة لـ anon و authenticated):
   ```sql
   grant execute on function public.ragwan_current_sponsor(uuid) to anon, authenticated;
   ```
3. احذف ما أنشأه الملف ولم يكن موجودًا قبله:
   ```sql
   drop function if exists public.ragwan_current_trainer_root_no(uuid);
   -- ملاحظة: احذفها فقط بعد إرجاع كود الخادم أيضًا، وإلا يعامل الخادم كل القادة كوضع مطالعة.
   drop function if exists public.ragwan_leader_can_manage_training(uuid);
   -- فقط إذا أكدت الخطوة 1 أن search_ragwan_trainees لم تكن موجودة:
   drop function if exists public.search_ragwan_trainees(uuid,text);
   notify pgrst, 'reload schema';
   ```
4. أعد استعلام الأعداد للتأكد.

> ملاحظة: إذا أضاف القائد متدربين بعد التطبيق ثم حدث التراجع، تبقى سجلاتهم محفوظة في الجداول لكن لن يستطيع القائد فتحها حتى يُعاد تطبيق الملف. لا يُحذف شيء.
