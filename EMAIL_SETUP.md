# SMTP Email Setup (Production Ready)

## Install nodemailer
```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

## Configure Environment Variables

Add to `.env.local`:
```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=Exam System <noreply@yourdomain.com>
```

## Gmail Setup (if using Gmail)

1. Enable 2-Factor Authentication
2. Generate App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App Passwords
   - Select "Mail" and "Other" (name it "Exam System")
   - Copy the 16-character password
   - Use it as `SMTP_PASSWORD`

## Other SMTP Providers

### Microsoft 365 / Outlook
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
```

### Custom SMTP Server
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
```

## Implementation in forgot-password route

Replace the email sending code in `app/api/admin/forgot-password/route.ts`:

```typescript
import nodemailer from 'nodemailer'

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
})

// Send email
try {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
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
  // Don't fail the request - token is still created and logged in development
}
```

## Testing

```bash
# In development, emails will be logged to console
# In production with SMTP configured, emails will be sent

# Test by going to /admin/forgot-password
```

## Troubleshooting

**Gmail "Less secure app" error**: 
- Use App Password instead of regular password
- Enable 2FA first

**Connection timeout**:
- Check firewall/antivirus
- Try port 465 with `secure: true`

**Authentication failed**:
- Verify username/password
- Check if SMTP allows external apps

## Anti-Spam Best Practices

1. **SPF Record**: Add to your domain's DNS
   ```
   v=spf1 include:_spf.google.com ~all
   ```

2. **DKIM**: Configure in your email provider

3. **DMARC**: Add policy
   ```
   v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com
   ```

4. **Use verified domain**: Don't use Gmail/Outlook as FROM address in production

5. **Professional content**: Avoid spam trigger words
