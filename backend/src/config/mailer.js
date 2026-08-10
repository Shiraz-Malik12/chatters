import nodemailer from 'nodemailer';

const isPlaceholder = (value = '') => {
  return value.includes('example.com') || value.includes('your-email') || value.trim().length === 0;
};

const port = Number(process.env.SMTP_PORT || 587);
const host = isPlaceholder(process.env.SMTP_HOST || '') ? 'smtp.gmail.com' : process.env.SMTP_HOST;
const user = isPlaceholder(process.env.SMTP_USER || '') ? process.env.EMAIL_USER : process.env.SMTP_USER;
const pass = isPlaceholder(process.env.SMTP_PASS || '') ? process.env.EMAIL_PASS : process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: {
    user,
    pass,
  },
});

export default transporter;
