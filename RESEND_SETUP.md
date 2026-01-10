# Resend Setup with Custom Domain (FREE)

## Why Resend?
- ✅ **3,000 emails/month FREE**
- ✅ Custom domain support
- ✅ Best deliverability (won't go to spam)
- ✅ Easy setup (5 minutes)

---

## Step 1: Create Resend Account

1. Go to https://resend.com
2. Sign up (free account)
3. Verify your email

---

## Step 2: Add Your Domain

### In Resend Dashboard:

1. Click "Domains" → "Add Domain"
2. Enter: `exams.itslab.online`
3. Resend will give you DNS records

### In Namecheap:

1. Go to Namecheap → Domain List → `itslab.online` → Manage
2. Click "Advanced DNS"
3. Add these records (Resend will provide exact values):

#### TXT Record (for verification)
```
Type: TXT
Host: exams
Value: [Resend will give you this]
TTL: Automatic
```

#### MX Records (for receiving bounces)
```
Type: MX
Host: exams
Value: feedback-smtp.us-east-1.amazonses.com
Priority: 10
TTL: Automatic
```

#### DKIM Record (for authentication - CRITICAL!)
```
Type: TXT
Host: resend._domainkey.exams
Value: [Resend will give you long string starting with v=DKIM1...]
TTL: Automatic
```

#### SPF Record (prevents spam)
```
Type: TXT
Host: exams
Value: v=spf1 include:amazonses.com ~all
TTL: Automatic
```

4. **Wait 10-30 minutes** for DNS to propagate
5. Back in Resend, click "Verify Domain"

---

## Step 3: Update Your Code

### Install Resend:
```bash
npm install resend
```

### Update `.env.local`:
```env
RESEND_API_KEY=re_123456789...  # Get from Resend dashboard
EMAIL_FROM=noreply@exams.itslab.online
```

### Update `app/api/admin/forgot-password/route.ts`:

Replace the nodemailer code with:

```typescript
import { Resend } from 'resend'

// At the top, after imports
const resend = new Resend(process.env.RESEND_API_KEY)

// Replace the SMTP section (lines ~78-142) with:
if (process.env.NODE_ENV === 'production' && process.env.RESEND_API_KEY) {
    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM || 'noreply@exams.itslab.online',
            to: admin.email,
            subject: 'Password Reset Request - Exam System',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; 
                                  text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; 
                                  color: #666; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Request</h1>
                        </div>
                        <div class="content">
                            <p>Hi <strong>${admin.name}</strong>,</p>
                            <p>We received a request to reset your password for the Exam System.</p>
                            <p>Click the button below to reset your password:</p>
                            <p style="text-align: center;">
                                <a href="${resetLink}" class="button">Reset Password</a>
                            </p>
                            <p>Or copy and paste this link into your browser:</p>
                            <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all;">
                                ${resetLink}
                            </p>
                            <div class="footer">
                                <p><strong>Important:</strong> This link will expire in 1 hour.</p>
                                <p>If you didn't request this password reset, you can safely ignore this email. 
                                   Your password will remain unchanged.</p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        })
        
        // console.log('✅ Password reset email sent to:', admin.email)
    } catch (emailError) {
        // console.error('❌ Email send failed:', emailError)
    }
} else {
    // Development mode
    // console.log('===================')
    // console.log('PASSWORD RESET LINK')
    // console.log('===================')
    // console.log(`Email: ${admin.email}`)
    // console.log(`Link: ${resetLink}`)
    // console.log(`Expires: ${expiresAt}`)
    // console.log('===================')
}
```

---

## Step 4: Test

### Development (no domain needed):
```bash
npm run dev
# Links appear in console
```

### Production:
1. Deploy to Vercel
2. Set environment variables:
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=noreply@exams.itslab.online`
3. Test forgot password - email should arrive! ✅

---

## Troubleshooting

**Domain not verified?**
- Wait 30 minutes for DNS propagation
- Check DNS records in Namecheap match Resend exactly
- Use DNS checker: https://mxtoolbox.com/SuperTool.aspx

**Emails going to spam?**
- Verify DKIM record is correct (most important!)
- Add DMARC record (optional but recommended):
  ```
  Type: TXT
  Host: _dmarc.exams
  Value: v=DMARC1; p=none; rua=mailto:admin@itslab.online
  ```

**API key not working?**
- Get new key from Resend dashboard
- Make sure it starts with `re_`
- Check if key is in production environment variables

---

## Free Tier Limits

**Resend Free Plan:**
- ✅ 3,000 emails/month
- ✅ 100 emails/day
- ✅ 1 custom domain
- ✅ All features included

**Enough for:**
- ~100 password resets/day
- ~3,000 password resets/month
- Perfect for exam system!

---

## Alternative (if you need more emails):

### Brevo (ex-Sendinblue)
- Free: 300 emails/day (9,000/month)
- SMTP setup
- Add in `.env.local`:
  ```env
  SMTP_HOST=smtp-relay.brevo.com
  SMTP_PORT=587
  SMTP_USER=your-brevo-email@gmail.com
  SMTP_PASSWORD=your-brevo-smtp-key
  ```

But **Resend is easier** and works better with custom domains!

---

## Summary

1. ✅ Sign up at resend.com
2. ✅ Add domain `exams.itslab.online`
3. ✅ Add DNS records in Namecheap
4. ✅ Install: `npm install resend`
5. ✅ Update code (see Step 3)
6. ✅ Deploy and test!

**Total cost: FREE! 🎉**
