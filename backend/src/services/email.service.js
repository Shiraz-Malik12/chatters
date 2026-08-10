import transporter from '../config/mailer.js';

const sendPasswordResetOtpEmail = async ({ to, name, otp }) => {
  const smtpFrom = process.env.SMTP_FROM || '';
  const fallbackUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const from = smtpFrom.includes('example.com') ? fallbackUser : smtpFrom || fallbackUser;

  await transporter.sendMail({
    from,
    to,
    subject: 'Your password reset OTP',
    text: `Hi ${name || 'there'}, your password reset OTP is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin:0 0 12px">Password Reset OTP</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Use this OTP to reset your password:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:20px 0">${otp}</p>
        <p>This OTP expires in 10 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
};

export { sendPasswordResetOtpEmail };
