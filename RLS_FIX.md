# 🔐 RLS Quick Fix Guide

## تم إضافة RLS Policies للجداول الحساسة

### الجداول المحمية الآن:

#### 1. `admins` - BLOCKED ❌
```sql
-- كل العمليات من الـ client محظورة!
-- Login/Register/etc يحصل من API routes فقط
CREATE POLICY "Block direct admin access"
ON admins FOR ALL TO anon USING (false);
```

**النتيجة**:
- ❌ مافيش client يقدر يعمل SELECT على admins table
- ❌ مافيش حد يقدر يشوف emails أو password hashes
- ✅ API routes (service_role) بس اللي تقدر تعمل operations

---

#### 2. `password_reset_tokens` - BLOCKED ❌
```sql
-- كل العمليات محظورة من client
CREATE POLICY "Block token modifications" ON password_reset_tokens FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "Block token updates" ON password_reset_tokens FOR UPDATE TO anon USING (false);
CREATE POLICY "Block token deletion" ON password_reset_tokens FOR DELETE TO anon USING (false);
CREATE POLICY "Block token reading" ON password_reset_tokens FOR SELECT TO anon USING (false);
```

**النتيجة**:
- ❌ مافيش حد يقدر يشوف tokens الموجودة
- ❌ مافيش حد يقدر يولد token بره النظام
- ✅ API routes بس اللي تقدر تعمل operations

---

## تطبيق الـ Policies

### في Supabase Dashboard:

1. افتح **SQL Editor**
2. Copy الـ SQL كامل من `rls_policies.sql`
3. اضغط **Run**
4. Verify بالأمر ده:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Should show rowsecurity = TRUE for:
-- - admins
-- - password_reset_tokens
-- - options
-- - student_answers
-- - student_attempts
-- - questions
-- - exams
-- - question_bank
-- - question_bank_options
```

---

## الصورة اللي بعتها

قبل:
```
admins              UNRESTRICTED  ❌
password_reset_tokens UNRESTRICTED  ❌
```

بعد تطبيق الـ SQL:
```
admins              RESTRICTED    ✅
password_reset_tokens RESTRICTED    ✅
```

---

## اختبار RLS

### Test 1: Try to access admins directly
```javascript
// في console الـ browser:
const { data, error } = await supabase.from('admins').select('*')
// Expected: error - Policy violation
```

### Test 2: API routes still work
```bash
# Login should work (uses service_role internally)
POST /api/admin/login
```

---

## ✅ كل حاجة دلوقتي آمنة!

- ✅ Admins table محمي
- ✅ Password reset tokens محمية
- ✅ is_correct field محمي
- ✅ كل العمليات الحساسة through API only
