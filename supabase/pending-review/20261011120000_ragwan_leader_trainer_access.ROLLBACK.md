# خطة النسخ الاحتياطي والتراجع — `20261011120000_ragwan_leader_trainer_access.sql`

> قاعدة بيانات Preview هي نفسها Production (`ryqpstkzppaifpvhezzn`). أي تطبيق يؤثر على المستخدمين فورًا.

## حالة Production التي بُني عليها الملف (فحص صاحب المشروع)
- 11 دالة لخطة رجوان، منها دوال إدارة المتدربين الثمانية: `add_ragwan_trainee_by_member_no`، `archive_ragwan_trainee`،
  `get_ragwan_training_progress`، `list_ragwan_trainees`، `record_ragwan_plan_completion_for_member`،
  `save_ragwan_training_step`، `select_ragwan_trainee`، `update_ragwan_trainee_display_name`.
- غير موجودة: `search_ragwan_trainees`، `get_ragwan_plan_completions`، `save_ragwan_success_plan_content`.
- صلاحيات EXECUTE تختلف بين الدوال.

القسم 0 في الملف يتحقق من هذه الحالة (الدوال، توقيع الدالتين اللتين يعاد تعريفهما، الأعمدة، القيد الفريد، دور
`service_role`)، ويوقف الملف كاملًا قبل أي تغيير إن اختلف شيء.

## ما يغيّره الملف
| العنصر | التغيير |
|---|---|
| `ragwan_current_sponsor` | فرع للقائد ذي الجذر الصالح؛ فرع العضو كما هو. EXECUTE لـ `service_role` فقط |
| `add_ragwan_trainee_by_member_no` | مصدر جذر الفريق + لا يعيد تفعيل عضو معطّل ولا يستبدل اسمه |
| دوال المتدربين الثمانية | **الجسم بلا تغيير**. EXECUTE لـ `service_role` فقط (تُسحب من PUBLIC و anon و authenticated) |
| جديدة | `ragwan_current_trainer_root_no`، `ragwan_leader_can_manage_training`، `search_ragwan_trainees` (لـ `service_role` فقط) |

لماذا سحب `anon` من الدوال الثمانية آمن: الواجهة لا تستدعي أيًا منها مباشرة، وكل استدعاءاتها تمر عبر
`api/ragwan-files.js` بالمفتاح السري (`service_role`)، الذي يُمنح صراحة. بدون هذا السحب يستطيع أي حساب
استدعاءها بالمفتاح العام عبر `/api/rpc` متجاوزًا رفض الخادم.

## قبل التطبيق (إلزامي)

1. **احفظ تعريفات كل دوال رجوان من Supabase نفسه** (مصدر التراجع، وليس ملفات المستودع):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like '%ragwan%'
   order by 1,2;
   ```
   احفظ الناتج كاملًا في ملف خارج المستودع.

2. **ولّد سكربت استعادة الصلاحيات الحالية واحفظه** (ناتجه أوامر SQL جاهزة، تعيد الصلاحيات حرفيًا كما هي الآن):
   ```sql
   -- ACL-SNAPSHOT-START
   select stmt from (
     select 1 as ord, p.oid::regprocedure::text as fn,
            format('revoke all on function %s from public, anon, authenticated, service_role;', p.oid::regprocedure) as stmt
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname like '%ragwan%'
     union all
     select 2, p.oid::regprocedure::text,
            format('grant execute on function %s to %s;', p.oid::regprocedure,
                   case when a.grantee=0 then 'public' else quote_ident(r.rolname) end)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     left join pg_roles r on r.oid=a.grantee
     where n.nspname='public' and p.proname like '%ragwan%' and a.privilege_type='EXECUTE'
       and (a.grantee=0 or r.rolname in ('anon','authenticated','service_role'))
   ) s order by fn, ord, stmt;
   -- ACL-SNAPSHOT-END
   ```
   انسخ كل الأسطر الناتجة إلى ملف خارج المستودع (مثل `ragwan-acl-restore.sql`).

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

5. **قارن** تعريف `add_ragwan_trainee_by_member_no` و `ragwan_current_sponsor` من الخطوة 1 بالملف. أي منطق في النسخة الحالية
   غير موجود في الملف يجب نقله إلى الملف قبل التطبيق (الملف يستبدل هاتين الدالتين فقط).

## ترتيب النشر (مهم)
- الواجهة و `api/ragwan-files.js` في هذا الفرع تسأل قاعدة البيانات عبر `ragwan_leader_can_manage_training`.
  قبل تطبيق الملف لا توجد هذه الدالة، فيعامل الخادم **كل** حسابات القائد كوضع مطالعة (fail closed). العضو لا يتأثر.
- لذلك: طبّق الملف أولًا، تحقق، ثم ادمج الكود. لا تدمج الكود قبل الملف.

## التطبيق
- من SQL Editor في وقت استخدام منخفض. الملف داخل `begin … commit`، فإما يُطبَّق كاملًا أو لا شيء.
- إن ظهر خطأ يبدأ بـ `ragwan precondition:` فلم يتغير شيء؛ أرسل نصه للمراجعة.

## بعد التطبيق مباشرة
1. أعد استعلام الأعداد (الخطوة 3) — يجب أن يكون مطابقًا.
2. الصلاحيات:
   ```sql
   select p.oid::regprocedure as fn,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('service_role', p.oid, 'execute') as service_role
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like '%ragwan%' order by 1;
   -- المتوقع: الدوال الثمانية + ragwan_current_sponsor + الدوال الثلاث الجديدة → false, false, true.
   -- دوال رجوان الأخرى (مثل قراءة المحتوى) بلا تغيير عن الخطوة 2.
   ```
3. وضع المطالعة — قراءة فقط، لا يغيّر أي حساب:
   ```sql
   select au.username, au.team_root_member_no is not null as has_root,
          exists(select 1 from public.app_users x where x.id=au.id and x.role='leader' and x.active
                 and coalesce(trim(x.team_root_member_no),'') ~ '^[0-9]{9}$') as can_manage_training
   from public.app_users au where au.role='leader';
   -- المتوقع: LEADER → true، LEADER1 → false
   ```
4. يدويًا: عضو يفتح خطة رجوان ويرى متدربيه وتقدمهم كما هو. LEADER يضيف متدربًا ويختاره ويحفظ خطوة.
   LEADER1 يرى الأبواب العشرة مع «وضع المطالعة»، وأي محاولة إدارة تُرفض.

## التراجع
لا يحتاج استعادة بيانات؛ الملف لا يغيّر أي صف عند التطبيق. نفّذ بالترتيب داخل معاملة واحدة:

1. شغّل التعريفات المحفوظة في الخطوة 1 لـ `ragwan_current_sponsor` و `add_ragwan_trainee_by_member_no` فقط
   (بقية الدوال لم يتغير جسمها).
2. احذف ما أنشأه الملف:
   ```sql
   drop function if exists public.search_ragwan_trainees(uuid,text);
   drop function if exists public.ragwan_current_trainer_root_no(uuid);
   -- احذفها فقط بعد إرجاع كود الخادم أيضًا، وإلا يعامل الخادم كل القادة كوضع مطالعة.
   drop function if exists public.ragwan_leader_can_manage_training(uuid);
   ```
3. شغّل سكربت الصلاحيات المحفوظ في الخطوة 2 (`ragwan-acl-restore.sql`) كما هو. يعيد صلاحيات كل دوال رجوان
   حرفيًا، ومنها `anon` على الدوال الثمانية إن كانت لها قبل التطبيق.
4. `notify pgrst, 'reload schema';` ثم أعد استعلام الأعداد واستعلام الصلاحيات للتأكد من مطابقة الخطوة 2.

> إذا أضاف القائد متدربين بعد التطبيق ثم حدث التراجع، تبقى سجلاتهم محفوظة في الجداول لكن لن يستطيع القائد فتحها حتى يُعاد تطبيق الملف. لا يُحذف شيء.
