const nodemailer = require("nodemailer")


// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: to,
      subject: subject,
      html: html,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Email sent successfully:", info.messageId)
    return true
  } catch (error) {
    console.error("Email sending failed:", error)

    // In development, log the email content instead of failing
    if (process.env.NODE_ENV === "development") {
      console.log(`
        ===== EMAIL WOULD BE SENT =====
        To: ${to}
        Subject: ${subject}
        HTML: ${html}
        ===============================
      `)
      return true
    }

    throw error
  }
}

const sendVerificationEmail = async (email, token, action = "verify-email") => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}&action=${action}`

  const subject =
    action === "link-account"
      ? "Link Your Password to Adventure Safari Account"
      : "Verify Your Adventure Safari Account"

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
              Adventure Safari Network
            </h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
              Your Gateway to Adventure
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px;">
              ${action === "link-account" ? "🔗 Link Your Account" : "✅ Verify Your Email"}
            </h2>
            
            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px; font-size: 16px;">
              ${
                action === "link-account"
                  ? "We found an existing Adventure Safari account with your email address. Click the button below to link your password authentication to your existing Google account."
                  : "Thank you for joining Adventure Safari Network! Please click the button below to verify your email address and activate your account."
              }
            </p>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${verificationUrl}" 
                 style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
                        color: white; 
                        padding: 15px 40px; 
                        text-decoration: none; 
                        border-radius: 50px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
                        transition: all 0.3s ease;">
                ${action === "link-account" ? "🔗 Link Account" : "✅ Verify Email"}
              </a>
            </div>
            
            <!-- Alternative Link -->
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="word-break: break-all; color: #3b82f6; font-size: 14px; margin: 0;">
                <a href="${verificationUrl}" style="color: #3b82f6;">${verificationUrl}</a>
              </p>
            </div>
            
            <!-- Security Notice -->
            <div style="border-left: 4px solid #f59e0b; padding-left: 15px; margin: 25px 0;">
              <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
                🔒 Security Notice
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
                This link will expire in 24 hours. If you didn't request this, please ignore this email.
              </p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} Adventure Safari Network. All rights reserved.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0; text-align: center;">
              This email was sent to ${email}
            </p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(email, subject, html)
}

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Adventure Safari Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
              Adventure Safari Network
            </h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
              Password Reset Request
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px;">
              🔑 Reset Your Password
            </h2>
            
            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px; font-size: 16px;">
              We received a request to reset your password for your Adventure Safari Network account. 
              Click the button below to create a new password.
            </p>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); 
                        color: white; 
                        padding: 15px 40px; 
                        text-decoration: none; 
                        border-radius: 50px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3);
                        transition: all 0.3s ease;">
                🔑 Reset Password
              </a>
            </div>
            
            <!-- Alternative Link -->
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="word-break: break-all; color: #3b82f6; font-size: 14px; margin: 0;">
                <a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a>
              </p>
            </div>
            
            <!-- Security Notice -->
            <div style="border-left: 4px solid #dc2626; padding-left: 15px; margin: 25px 0;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 500;">
                🔒 Security Notice
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
                This link will expire in 1 hour. If you didn't request this password reset, please ignore this email and your password will remain unchanged.
              </p>
            </div>
            
            <!-- Help Section -->
            <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <p style="color: #1e40af; font-size: 14px; margin: 0 0 5px 0; font-weight: 500;">
                💡 Need Help?
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                If you're having trouble accessing your account, please contact our support team.
              </p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} Adventure Safari Network. All rights reserved.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0; text-align: center;">
              This email was sent to ${email}
            </p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(email, "Reset Your Adventure Safari Password", html)
}

const sendWelcomeEmail = async (email, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Adventure Safari Network</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
              Adventure Safari Network
            </h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
              Welcome to Your Adventure Journey!
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px;">
              🎉 Welcome, ${name}!
            </h2>
            
            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px; font-size: 16px;">
              Thank you for joining DiaryFi! Your account has been successfully created and verified. 
              You're now ready to explore amazing safari adventures around the world.
            </p>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${process.env.CLIENT_URL}/dashboard" 
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                        color: white; 
                        padding: 15px 40px; 
                        text-decoration: none; 
                        border-radius: 50px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                        transition: all 0.3s ease;">
                🚀 Explore Dashboard
              </a>
            </div>
            
            <!-- Features -->
            <div style="background: #f0fdf4; padding: 25px; border-radius: 8px; margin: 25px 0;">
              <h3 style="color: #166534; margin: 0 0 15px 0; font-size: 18px;">
                🌟 What's Next?
              </h3>
              <ul style="color: #6b7280; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Browse our exclusive safari packages</li>
                <li style="margin-bottom: 8px;">Connect with experienced guides</li>
                <li style="margin-bottom: 8px;">Plan your dream adventure</li>
                <li>Join our community of adventure seekers</li>
              </ul>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} Adventure Safari Network. All rights reserved.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0; text-align: center;">
              This email was sent to ${email}
            </p>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(email, "Welcome to Adventure Safari Network! 🎉", html)
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
}
