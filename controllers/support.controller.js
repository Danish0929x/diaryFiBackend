const { sendEmail } = require("../utils/emailService");

const sendSupportEmail = async (req, res) => {
  try {
    const { subject, message } = req.body;

    // Validate input
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    // Create email HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Support Message from DiaryFi</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2E5C8A 0%, #2E8BC0 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
                DiaryFi Support
              </h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">
                User Support Message
              </p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin-bottom: 15px; font-size: 22px;">
                Subject: ${subject}
              </h2>

              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border-left: 4px solid #2E8BC0; margin: 25px 0;">
                <p style="color: #374151; line-height: 1.6; margin: 0; white-space: pre-wrap;">
                  ${message}
                </p>
              </div>

              <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #1e40af; font-size: 14px; margin: 0; font-weight: 500;">
                  📧 Sent via DiaryFi Support Form
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                © ${new Date().getFullYear()} DiaryFi. All rights reserved.
              </p>
            </div>

          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    await sendEmail(
      process.env.SUPPORT_EMAIL || process.env.FROM_EMAIL,
      `Support: ${subject}`,
      html
    );

    res.status(200).json({
      success: true,
      message: "Your support message has been sent successfully. We'll respond within 24 hours.",
    });
  } catch (error) {
    console.error("Support email error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send support message",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  sendSupportEmail,
};
