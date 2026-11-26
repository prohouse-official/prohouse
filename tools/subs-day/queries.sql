-- استعلامات أوراق الاشتراكات (تنعمل بأداة Supabase execute_sql — المشروع sadtinfdwucwrxlmwxov)
-- takrar_suborders_slim ما بتشتغل من execute_sql (بدها جلسة تطبيق)، فهاد نفس منطقها مباشرة.
-- بدّل التواريخ، وانسخ عمود j لكل يوم بـ subs.json بالشكل {"YYYY-MM-DD": [...]}.

-- ١) subs.json — الزباين (الفلترة: confirmed + مش pickup بتصير بالكود)
select t.date, jsonb_agg(jsonb_build_object(
    'sid', e->>'subscription','so', e->>'id',
    'name', btrim(regexp_replace(coalesce(e#>>'{customer_profile,account,name}', ''), '\s+', ' ', 'g')),
    'plan', e#>>'{plan,name_ar}','status', e->>'status','service', e->>'service_type',
    'ordering', coalesce((e->>'ordering')::int, 0),'captain', e#>>'{captain,name}',
    'window', nullif(concat_ws(' - ', e#>>'{delivery_window,from_time}', e#>>'{delivery_window,to_time}'), ''),
    'district', left(regexp_replace(coalesce(e#>>'{location,district}', ''), '[⁦-⁩]', '', 'g'), 40),
    'city', e#>>'{location,city,name_ar}',
    'notes', nullif(nullif(btrim(coalesce(e->>'notes','')), '-'), ''),
    'meals', (select coalesce(jsonb_agg(jsonb_build_object('cat', c->>'name_ar','ar', o#>>'{product,name_ar}','en', o#>>'{product,name_en}',
        'variant', (select string_agg(v->>'name_ar', ' / ') from jsonb_array_elements(coalesce(o->'variants','[]'::jsonb)) v),
        'variant_en', (select string_agg(v->>'name_en', ' / ') from jsonb_array_elements(coalesce(o->'variants','[]'::jsonb)) v)
      ) order by coalesce((c->>'ordering')::int,0), coalesce((o->>'ordering')::int,0)), '[]'::jsonb)
      from jsonb_array_elements(coalesce(e->'selected_plan_categories','[]'::jsonb)) c, jsonb_array_elements(coalesce(c->'selected_options','[]'::jsonb)) o)
  ) order by coalesce((e->>'ordering')::int, 0)) filter (where e->>'status'='confirmed' and e->>'service_type'<>'pickup') j
from takrar_suborders t, jsonb_array_elements(t.items) e
where t.date in ('2026-11-26') group by t.date order by 1;

-- ٢) boq.json — {"YYYY-MM-DD": items}
select date, items from takrar_boq where date in ('2026-11-26') order by date;

-- ٣) standing.json — الطلبات الثابتة وتعديلات الزباين
select value from settings where key = 'takrar_standing_orders';

-- ٤) orders.json — طلبية الغد للفروع (تاريخ الطلبية = يوم قبل الاشتراكات)
select json_agg(json_build_object('date',date,'branch',branch,'item_id',item_id,'item_name',item_name,'unit',unit,'qty',qty,'notes',coalesce(notes,''),'cook_name',coalesce(cook_name,'')))
from tomorrow_orders where date = '2026-11-25';

-- ٥) items.json
select json_agg(to_jsonb(i) - 'updated_at') from items i;

-- ٦) نسخ طلبية نفس اليوم من الأسبوع الماضي لكل الفروع (أول شي أرشف أي طلبية قديمة — ممنوع DELETE)
-- update tomorrow_orders set date = 'old-' || date where date = '2026-11-25';
-- insert into tomorrow_orders (date, branch, item_id, item_name, unit, qty, notes, employee_name, saved_at, cook_name)
--   select '2026-11-25', branch, item_id, item_name, unit, qty, notes, employee_name, now(), cook_name from tomorrow_orders where date = '2026-11-18';

-- ٧) تعديل الكميات حسب الأسبوع الماضي: اللي خلص (المتبقي ≈ 0) زيد ~10%، واللي ضل منه ≥ 40% نقص ~10% (مقرّب لـ 50)
select o.branch, o.item_name, o.qty, d.received, coalesce(d.remaining_weight, d.remaining) remaining
from tomorrow_orders o left join daily_entries d on d.date = '2026-11-18' and d.branch = o.branch and d.item_id = o.item_id
where o.date = '2026-11-25' and o.qty > 0 order by o.branch, o.item_name;
