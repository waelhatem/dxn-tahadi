-- Iraq DXN contact directory sourced from the user's branch-list text.
-- Fallujah phone corrected to +9647827579009 from DXN Arabia's Iraq branches PDF.
-- Sulaymaniyah map deliberately left empty: source repeats Duhok's link.
-- Category "online" never represents a physical map point.
-- The file also lists newer Nasiriyah details and two distinct sales points.
begin;
insert into public.dxn_directory_countries(name_ar,active)
select 'العراق',true
where not exists (
 select 1 from public.dxn_directory_countries where lower(btrim(name_ar))=lower('العراق')
);

with source(name,city,address,phone,maps_url,whatsapp_url,category) as (
 values
    ('مركز نينوى – الموصل','الموصل – نينوى','حي المصاريف، مقابل بيت أرشد زيباري، فوق تجهيزات الغيث','+9647706665816','https://maps.google.com/?cid=2009453277720185718&entry=gps','https://wa.me/9647706665816','branch'),
    ('مركز أربيل','أربيل','شارع الأربعين، كاليري مول، قرب صوفي مول','+9647704858486','https://maps.app.goo.gl/vqafaMoT4btxxc9Q8','https://wa.me/message/JRX2IE34CAW7A1','branch'),
    ('مركز دهوك','دهوك','شارع KRO، داخل مستشفى جيان الألماني، بجوار M سنتر','+9647507766394','https://maps.app.goo.gl/chBTaCWJnpxRKFsn6','https://wa.me/qr/KF74GLN3WEUOF1','branch'),
    ('مركز السليمانية','السليمانية','سرجنار، قرب جامع مشخلان، مقابل محطة الكهرباء','+9647700258828','','https://wa.me/qr/7IVQRAWEX2GTJ1','branch'),
    ('مركز كركوك','كركوك','شارع الجمهورية، مودا مول، الطابق الأول، قرب صيرفة عزيز','+9647737227941','https://maps.app.goo.gl/zdmXYMF4pgUkbtd5A','https://wa.me/qr/KRLTZZCQWNIVD1','branch'),
    ('مركز صلاح الدين – تكريت','تكريت – صلاح الدين','شارع الزهور، مقابل كلية التربية للبنات، بجانب الناصر مول','+9647737919744','https://maps.google.com/?cid=2694431016924597076&entry=gps','https://wa.me/qr/D2TE75L3LZX4C1','branch'),
    ('مركز ديالى – بعقوبة','بعقوبة – ديالى','العزات، مدخل كراج البحيرة، خلف جامع الشافعي','+9647822717473','https://goo.gl/maps/2fHPGTMMUJvYooyH6','https://wa.me/qr/GZXQX63QLGWWG1','branch'),
    ('مركز بغداد – المأمون','بغداد – المأمون','حي المأمون، الشارع العام، بجانب مجمع الأندلس','+9647811691251','https://maps.app.goo.gl/BWeuTHxUxavLqBrE8','https://wa.me/9647811691251','branch'),
    ('مركز بغداد – الأعظمية','بغداد – الأعظمية','شارع الضباط، بجانب ماكس مول، عمارة فلافل لبنان، الطابق الأول','+9647722700221','https://maps.app.goo.gl/4YT6uwFNjuCmo5fT8','https://wa.me/qr/P2VPCZ3BSRTMM1','branch'),
    ('مركز بغداد – الدورة','بغداد – الدورة','شارع أبو طيارة، عمارة برج أبو طيارة، الطابق السابع','+9647711191608','https://maps.app.goo.gl/L9ZmJT2XniEMsFff9','https://wa.me/qr/MWSOR3U4HDJ3K1','branch'),
    ('مركز الأنبار – الفلوجة','الفلوجة – الأنبار','حي 7 نيسان، قرب تقاطع الكماليات، خلف جمعية العبدلي، فوق معرض سفانا','+9647827579009','https://maps.app.goo.gl/5HXiSCips6uE42R68','https://wa.me/qr/4TNCXYQSARP6D1','branch'),
    ('مركز الأنبار – الرمادي','الرمادي – الأنبار','شارع السينما، قرب مطعم الفلوجة','+9647822002278','https://maps.app.goo.gl/PJ3NSimSWCpjCq5D9','https://wa.me/message/CZLYDKP56DFAN1','branch'),
    ('مركز كربلاء','كربلاء','حي البلدية، شارع غرفة التجارة، بجانب رعد الشوك للإطارات، تحت قاعة شهرزاد للمناسبات','+9647739742741','https://maps.app.goo.gl/WTMvhqrQ27V18nLTA','https://wa.me/qr/ZLKGO6KKQROIG1','branch'),
    ('مركز النجف','النجف','نهاية شارع الروان، مقابل كافيه العافية، بجانب صيرفة السدى، داخل القيصرية','+9647721615393','https://maps.app.goo.gl/Fr4RfPSo4fxXRyEj9','https://wa.me/qr/5ISCBSCEEIGPK1','branch'),
    ('مركز بابل – الحلة','الحلة – بابل','شارع 40، قرب مجمع السلطانة، مقابل مطعم البندقية','+9647827223331','https://maps.google.com/?cid=18112531220304554535&entry=gps','https://wa.me/qr/QCTWJPYUDCCUC1','branch'),
    ('مركز ميسان – العمارة','العمارة – ميسان','شارع التربية، قرب مجمع المعارف، مقابل صيدلية السرور','+9647716867203','https://maps.app.goo.gl/TW5H146TGGskno7T8','https://wa.me/qr/FU32MDGAPD7EJ1','branch'),
    ('مركز ذي قار – الناصرية','الناصرية – ذي قار','صوب الشامية، شارع النهر، قرب مرطبات بكداش، قرب النادي اللبناني','+9647840294848','https://maps.app.goo.gl/tRKX7cojUXNVQbyM9','https://wa.me/message/3NBXGJUB65LGL1','branch'),
    ('مركز البصرة','البصرة','شارع الوفود، قبل تقاطع المشرق الجديد، مقابل كيوت سنتر','+9647728187171','https://maps.app.goo.gl/STBvNeBi9BFt3eMt8','https://wa.me/qr/FRIU6FIHYF32O1','branch'),
    ('نقطة بيع كربلاء – شارع السناتر','كربلاء','شارع السناتر، مجمع الساعتي، الطابق الثاني','','','','sales_point'),
    ('نقطة بيع الناصرية – الإدارة المحلية','الناصرية – ذي قار','الإدارة المحلية، قرب بهو بلدية الناصرية، داخل مجمع كاردينيا','+9647840294848','','','sales_point'),
    ('خدمة توصيل DXN أونلاين – البصرة','البصرة','توصيل لجميع أنحاء البصرة وضواحيها','+9647728186161','','https://wa.me/qr/MHXAZL5QHS4LK1','online'),
    ('خدمة توصيل DXN أونلاين – بغداد','بغداد','توصيل لجميع محافظات العراق باستثناء البصرة وإقليم كردستان','+9647718387171','','https://wa.me/message/YRBZPMXW72FVD1','online'),
    ('خدمة توصيل DXN أونلاين – كردستان','إقليم كردستان','توصيل لجميع محافظات إقليم كردستان','+9647718388181','','https://wa.me/message/UDNOJC46TPVSL1','online')
), target as (
 select id from public.dxn_directory_countries where name_ar='العراق' limit 1
)
insert into public.dxn_directory_branches
 (country_id,name,city,address,phone,maps_url,whatsapp_url,category,latitude,longitude,active)
select t.id,s.name,s.city,s.address,s.phone,s.maps_url,s.whatsapp_url,s.category,null,null,true
from source s cross join target t
where not exists (
  select 1 from public.dxn_directory_branches b where b.country_id=t.id and b.name=s.name
);
commit;
