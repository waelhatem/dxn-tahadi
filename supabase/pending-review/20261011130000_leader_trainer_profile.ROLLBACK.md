# خطة التطبيق والتراجع — `20261011130000_leader_trainer_profile.sql`

> قاعدة بيانات Preview هي نفسها Production. لا تطبّق قبل موافقة صاحب المشروع.

## ما يضيفه الملف (كله جديد، لا يعدّل شيئًا موجودًا)
| العنصر | الوصف |
|---|---|
| جدول `leader_trainer_profiles` | بيانات عرض المدرب لحساب القائد: الاسم، رقم العضوية، الصفة. مفتاحه `app_users.id`. RLS مفعّل بلا سياسات، ولا صلاحيات لـ anon أو authenticated |
| صف واحد | لحساب القائد النشط الذي جذر فريقه 820469486: «وائل حاتم» / 820469486 / «مصمم مجتمع الصحة والثراء وقائده» |
| `get_ragwan_trainer_identity(uuid)` | بيانات المدرب للحساب الحالي فقط. للخادم فقط |
| `save_leader_trainer_profile(uuid,text,text,text)` | تعديلها لحساب القائد مدير التدريب فقط، لنفسه فقط. للخادم فقط |

لا يغيّر `app_users` (ولا `member_id` لحساب القائد) ولا `members` ولا أي جدول تدريب. ملكية المتدربين والتقدم والشهادات
تبقى على `sponsor_user_id = app_users.id`.

## الترتيب
1. `20261011120000_ragwan_leader_trainer_access.sql` (مع خطوات الحفظ في خطته).
2. هذا الملف. يتوقف إن لم يكن الأول مطبّقًا.
3. التحقق أدناه، ثم الدمج.

قبل تطبيق هذا الملف يعمل الكود دون أخطاء: بطاقة «بيانات المدرب» تعرض «لم تُحدَّد بيانات المدرب بعد»، والشهادة تبقى على
اسم الحساب الحالي، والحفظ يُرفض برسالة.

## بعد التطبيق
```sql
select au.username, lp.display_name, lp.member_no, lp.title,
       au.member_id is null as leader_still_not_linked_to_member
from public.leader_trainer_profiles lp join public.app_users au on au.id = lp.user_id;
-- المتوقع: صف واحد لحساب LEADER، و leader_still_not_linked_to_member = true.

select has_function_privilege('anon','public.get_ragwan_trainer_identity(uuid)','execute') as anon_get,
       has_function_privilege('anon','public.save_leader_trainer_profile(uuid,text,text,text)','execute') as anon_save,
       has_table_privilege('anon','public.leader_trainer_profiles','select') as anon_table;
-- المتوقع: false, false, false
```
يدويًا: LEADER يرى البطاقة في «إدارة القائد» ويعدّلها؛ LEADER1 لا يرى زر التعديل (ومحاولة الحفظ تُرفض من الخادم)؛
شهادة يُصدرها LEADER تحمل «وائل حاتم» تحت «المشرف على التدريب».

## التراجع
احفظ القيم الحالية أولًا إن كانت عُدّلت: `select * from public.leader_trainer_profiles;`
```sql
begin;
drop function if exists public.save_leader_trainer_profile(uuid,text,text,text);
drop function if exists public.get_ragwan_trainer_identity(uuid);
drop table if exists public.leader_trainer_profiles;
commit;
notify pgrst, 'reload schema';
```
لا يمس أي جدول أو دالة أخرى. بعده تعود الواجهة إلى «لم تُحدَّد بيانات المدرب بعد» والشهادة إلى اسم الحساب الحالي.
