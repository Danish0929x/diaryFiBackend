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

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your DiaryFi Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px;">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">DiaryFi</h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0;">Password Reset Request</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Reset Your Password</h2>

            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px;">
              We received a request to reset your password for your DiaryFi account.
              Click the button below to create a new password.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetUrl}"
                 style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                        display: inline-block;">
                Reset Password
              </a>
            </div>

            <!-- Security Notice -->
            <p style="color: #6b7280; font-size: 14px; margin: 25px 0 0 0;">
              This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} DiaryFi. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(email, "Reset Your DiaryFi Password", html)
}

const sendWelcomeEmail = async (email, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to DiaryFi</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px;">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">DiaryFi</h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0;">Welcome to Your Personal Journal</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Welcome, ${name}!</h2>

            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px;">
              Thank you for joining DiaryFi! Your account has been successfully created and verified.
              Start capturing your thoughts and memories today.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${process.env.CLIENT_URL}/dashboard"
                 style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                        display: inline-block;">
                Get Started
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} DiaryFi. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(email, "Welcome to DiaryFi", html)
}

const sendOtpEmail = async (email, otp, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your DiaryFi Account</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
              DiaryFi
            </h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
              Your Personal Journal
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px;">
              Hello ${name}! 👋
            </h2>

            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px; font-size: 16px;">
              Thank you for registering with DiaryFi! To complete your registration, please use the following 4-digit verification code:
            </p>

            <!-- OTP Code -->
            <div style="text-align: center; margin: 35px 0;">
              <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%);
                          color: white;
                          padding: 25px 40px;
                          border-radius: 15px;
                          display: inline-block;
                          box-shadow: 0 4px 15px rgba(46, 139, 192, 0.3);">
                <p style="margin: 0 0 5px 0; font-size: 14px; opacity: 0.9;">Verification Code</p>
                <p style="margin: 0; font-size: 42px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${otp}
                </p>
              </div>
            </div>

            <!-- Instructions -->
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2E8BC0;">
              <p style="color: #1e40af; font-size: 14px; margin: 0 0 10px 0; font-weight: 500;">
                📝 How to verify:
              </p>
              <ul style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 5px;">Enter this code in the DiaryFi app</li>
                <li style="margin-bottom: 5px;">Code is valid for 10 minutes</li>
                <li>Don't share this code with anyone</li>
              </ul>
            </div>

            <!-- Security Notice -->
            <div style="border-left: 4px solid #dc2626; padding-left: 15px; margin: 25px 0;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 500;">
                🔒 Security Notice
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
                If you didn't request this code, please ignore this email. Your account is safe.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} DiaryFi. All rights reserved.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0; text-align: center;">
              This email was sent to ${email}
            </p>
          </div>

        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, "DiaryFi - Verify Your Email with OTP", html);
};

const sendTempPasswordEmail = async (email, tempPassword, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your DiaryFi Temporary Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
              DiaryFi
            </h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
              Password Reset Successful
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px;">
              Hello ${name}! 👋
            </h2>

            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 25px; font-size: 16px;">
              We've received your request to reset your password. Your new temporary password is:
            </p>

            <!-- Temporary Password -->
            <div style="text-align: center; margin: 35px 0;">
              <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%);
                          color: white;
                          padding: 20px 30px;
                          border-radius: 12px;
                          display: inline-block;
                          box-shadow: 0 4px 15px rgba(46, 139, 192, 0.3);
                          max-width: 90%;">
                <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.9;">Temporary Password</p>
                <p style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                  ${tempPassword}
                </p>
              </div>
            </div>

            <!-- Instructions -->
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2E8BC0;">
              <p style="color: #1e40af; font-size: 14px; margin: 0 0 10px 0; font-weight: 500;">
                📝 Next Steps:
              </p>
              <ul style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 5px;">Use this password to login to your account</li>
                <li style="margin-bottom: 5px;">We recommend changing this password after logging in</li>
                <li>Keep this password secure and don't share it with anyone</li>
              </ul>
            </div>

            <!-- Security Notice -->
            <div style="border-left: 4px solid #dc2626; padding-left: 15px; margin: 25px 0;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 500;">
                🔒 Security Notice
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
                If you didn't request this password reset, please contact us immediately. Your account may be at risk.
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${process.env.CLIENT_URL}/login"
                 style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                        display: inline-block;">
                Login Now
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              © ${new Date().getFullYear()} DiaryFi. All rights reserved.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0; text-align: center;">
              This email was sent to ${email}
            </p>
          </div>

        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, "DiaryFi - Your Temporary Password", html);
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendTempPasswordEmail,
}
