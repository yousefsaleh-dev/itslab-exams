# 🚀 Deployment Guide: Exam Recovery System

## Overview
نظام استعادة شامل متعدد الطبقات لحل 100% من مشاكل الامتحانات المحتملة.

---

## 📋 الخطوات المطلوبة

### ✅ Step 1: تطبيق Database Migrations

1. افتح **Supabase Dashboard** → SQL Editor
2. انسخ محتوى файل `database_migrations.sql`
3. الصق في SQL Editor
4. اضغط ▶ Run

**ماذا يفعل هذا:**
- يضيف أعمدة جديدة: `auto_submitted`, `auto_submit_reason`, `recovery_count`, `last_recovery_at`
- ينشئ جدول `attempt_recovery_log` لتسجيل عمليات الاستعادة
- يضيف constraints للحماية
- ينشئ indexes للأداء
- ينشئ helper functions و views للمراقبة

**التحقق:**
```sql
-- تأكد من وجود الأعمدة الجديدة
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'student_attempts' 
AND column_name IN ('auto_submitted', 'recovery_count');

-- يجب أن يرجع 2 rows
```

---

### ✅ Step 2: Deploy Edge Function (Optional - يمكن تأجيله)

> **ملاحظة:** هذه الخطوة اختيارية في البداية. يمكن تفعيلها لاحقاً عندما تحتاج auto-submit تلقائي.

#### المتطلبات:
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login
```

#### Deploy:
```bash
# في مجلد المشروع
cd d:\Projects\exams_system_itslab

# Deploy function
supabase functions deploy auto-submit-expired --project-ref YOUR_PROJECT_REF
```

#### إعداد Cron Job:
1. افتح **Supabase Dashboard** → Edge Functions
2. اضغط على `auto-submit-expired`
3. Cron Jobs → Add Cron Job
4. Schedule: `*/2 * * * *` (كل دقيقتين)
5. Save

**ماذا يفعل هذا:**
- يفحص كل دقيقتين عن محاولات منتهية
- يسلم تلقائياً المحاولات التي:
  - `time_remaining_seconds <= 0` (الوقت انتهى فقط)
- يسجل السبب في `auto_submit_reason`
- **لا** يسلم بناءً على عدم النشاط - الطالب قد يكون يفكر!

**اختبار يدوي:**
```bash
# استدعاء الـ function يدوياً للاختبار
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-submit-expired
```

---

### ✅ Step 3: الكود الجديد جاهز تلقائياً! ✅

الملفات التالية تم إنشاؤها/تحديثها:
- ✅ `app/api/exam/[id]/recover/route.ts` - Recovery API
- ✅ `app/exam/[id]/page.tsx` - Auto-recovery logic
- ✅ `lib/supabase.ts` - Updated types

**لا يوجد شيء إضافي تحتاج فعله!** الكود سيعمل تلقائياً عند إعادة تشغيل `npm run dev`

---

## 🧪 Testing

### Test 1: مسح localStorage أثناء الامتحان

1. افتح DevTools (F12)
2. ابدأ امتحان كطالب
3. أجب على بعض الأسئلة
4. في Console اكتب:
   ```javascript
   localStorage.clear()
   ```
5. أعد تحميل الصفحة (F5)

**النتيجة المتوقعة:**
- Toast message: "🔄 Session recovered!"
- يتم استعادة الإجابات والوقت المتبقي
- يظهر Resume screen

---

### Test 2: انقطاع النت والوقت انتهى

1. ابدأ امتحان مدته 5 دقائق
2. بعد دقيقة، افصل الإنترنت
3. انتظر 6 دقائق (أكثر من مدة الامتحان)
4. أعد الاتصال

**النتيجة المتوقعة (إذا Edge Function مفعلة):**
- الـ Edge Function تكتشف انتهاء الوقت
- تسلم المحاولة تلقائياً
- عند فتح الصفحة، يرى الطالب "Exam time has expired"

**النتيجة المتوقعة (إذا Edge Function غير مفعلة):**
- Recovery API ترجع `expired: true`
- الطالب يرى "Exam time has expired"

**ملاحظة:** عدم النشاط لفترة طويلة **لا** يؤدي لتسليم تلقائي - الطالب قد يكون يفكر!

---

### Test 3: Recovery API مباشرة

```bash
curl -X POST http://localhost:3000/api/exam/EXAM_ID/recover \
  -H "Content-Type: application/json" \
  -d '{"studentName": "Test Student"}'
```

**استجابة متوقعة:**
```json
{
  "success": true,
  "found": true,
  "data": {
    "attemptId": "xxx",
    "answers": {...},
    "timeRemaining": 120,
    ...
  }
}
```

---

## 📊 Monitoring

### مراقبة المحاولات المشبوهة:
```sql
SELECT * FROM suspicious_attempts_view
ORDER BY started_at DESC
LIMIT 50;
```

### مراجعة عمليات الاستعادة:
```sql
SELECT 
  sa.student_name,
  sa.recovery_count,
  sa.last_recovery_at,
  arl.recovery_method,
  arl.recovered_at
FROM student_attempts sa
LEFT JOIN attempt_recovery_log arl ON arl.attempt_id = sa.id
WHERE sa.recovery_count > 0
ORDER BY sa.last_recovery_at DESC;
```

### إحصائيات التسليم التلقائي:
```sql
SELECT 
  auto_submit_reason,
  COUNT(*) as count,
  ROUND(AVG(score), 2) as avg_score
FROM student_attempts
WHERE auto_submitted = true
GROUP BY auto_submit_reason;
```

---

## 🎯 السيناريوهات المغطاة

| السيناريو | الحل |
|-----------|------|
| **مسح localStorage** | ✅ Auto-recovery API |
| **النت انقطع والوقت انتهى** | ✅ Edge Function + Recovery API |
| **عدم نشاط (الطالب يفكر)** | ✅ لا تسليم تلقائي - مسموح! |
| **فتح في تابين** | ✅ Database constraint |
| **Browser crash** | ✅ Auto-recovery on reload |
| **محاولة تكرار التسليم** | ✅ API validation |

---

## ⚙️ Environment Variables Required

في `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # مهم للـ APIs
```

---

## 🔧 Troubleshooting

### المشكلة: Recovery API لا يعمل
**الحل:**
1. تأكد من `SUPABASE_SERVICE_ROLE_KEY` في `.env.local`
2. تأكد من تطبيق database migrations
3. تحقق من console للـ errors

### المشكلة: RPC function not found
**الحل:**
```sql
-- تأكد من وجود الـ function
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'log_attempt_recovery';

-- إذا غير موجودة، شغل migrations مرة أخرى
```

### المشكلة: Edge Function لا تعمل
**الحل:**
1. تحقق من Logs في Supabase Dashboard
2. تأكد من Cron Job مُعَد صح
3. اختبر الـ function يدوياً أولاً

---

## 📝 Notes

- **الأمان:** كل الحسابات الحرجة في Server
- **الأداء:** Edge Function كل دقيقتين (يمكن التعديل)
- **التوافق:** يعمل مع الكود الحالي بدون breaking changes
- **Rollback:** متوفر في نهاية `database_migrations.sql`

---

## ✅ Checklist

- [ ] تطبيق database migrations
- [ ] التحقق من الـ new columns
- [ ] اختبار Recovery API
- [ ] اختبار Auto-recovery في المتصفح
- [ ] (Optional) Deploy Edge Function
- [ ] (Optional) إعداد Cron Job
- [ ] مراجعة Monitoring queries

---

**🎉 بعد إتمام الخطوات، النظام جاهز لتغطية 100% من الاحتمالات!**
