-- Egypt DXN directory with explicit operator distinctions (2026-11-16).
-- First three: DXN Egypt Alidrisi (dxnegypt.com.eg) current official branch page.
-- Fourth: DAEHSAN EGYPT service center, DXN Africa's present official contact directory.
-- Fifth: La Puri, authorized distributor in DXN Africa Egypt service-centre PDF,
--   corroborated by current public business listing, but not an Alidrisi branch.
-- Do not claim all five to be Alidrisi branches or assign unverified map pins.
begin;
insert into public.dxn_directory_countries(name_ar,active)
select 'مصر',true
where not exists(select 1 from public.dxn_directory_countries where lower(btrim(name_ar))='مصر');
with egypt as (
 select id from public.dxn_directory_countries where name_ar='مصر' limit 1
), source(name,city,address,phone,working_hours,category) as (
 values
    ('DXN الإدريسي – فرع المهندسين','المهندسين – الجيزة','المهندسين، 19 شارع البطل أحمد عبد العزيز، عمارة 19، الطابق الخامس، الجيزة','+201066882897','السبت إلى الخميس 10:00 صباحًا–10:00 مساءً؛ الجمعة 2:00 مساءً–10:00 مساءً','branch'),
    ('DXN الإدريسي – فرع الإسكندرية','سيدي جابر – الإسكندرية','سيدي جابر، مصطفى كامل، عمارة 85، الطابق الأرضي، بعد فتح الله سيتي سكوير، الإسكندرية','+201066882754','السبت إلى الأربعاء 10:00 صباحًا–10:00 مساءً؛ الخميس 10:00 صباحًا–4:00 مساءً؛ الجمعة إجازة','branch'),
    ('DXN الإدريسي – فرع السادس من أكتوبر','السادس من أكتوبر – الجيزة','منطقة الحصري، المحور المركزي، الحي الأول، مقابل جامعة السادس من أكتوبر، بجوار مطعم عز المنوفي، عقار 425، الطابق الثاني، شقة 6 (يمين المصعد)، الجيزة','+201066882797','','branch'),
    ('مركز خدمة DXN مصر الجديدة (DAEHSAN EGYPT)','مصر الجديدة – القاهرة','27 شارع الشهيد عبد الوهاب القاضي، متفرع من شارع العروبة، أرض الجولف، مصر الجديدة، القاهرة','+201509967572','الأحد إلى الخميس 10:00 صباحًا–7:00 مساءً','branch'),
    ('موزع DXN المعتمد La Puri – مدينة نصر','مدينة نصر – القاهرة','43 شارع خضر التوني، مدينة نصر، القاهرة، بالقرب من مترو الاستاد','+201080404135','السبت إلى الخميس 10:00 صباحًا–9:00 مساءً؛ الجمعة 3:00 مساءً–9:00 مساءً (وفق دليل DXN Africa السابق؛ يرجى تأكيد الدوام)','sales_point')
)
insert into public.dxn_directory_branches
(country_id,name,city,address,phone,working_hours,category,maps_url,whatsapp_url,latitude,longitude,active)
select egypt.id,source.name,source.city,source.address,source.phone,source.working_hours,source.category,'','',null,null,true
from egypt cross join source
where not exists (
 select 1 from public.dxn_directory_branches b where b.country_id=egypt.id and b.name=source.name
);
commit;
