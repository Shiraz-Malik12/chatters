import jwt from 'jsonwebtoken';

const accessTokenSecret = process.env.JWT_SECRET;
const resetTokenSecret = process.env.RESET_JWT_SECRET || process.env.JWT_SECRET;

const signAccessToken = ({ id, email, role }) => {
  if (!accessTokenSecret) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign({ email, role }, accessTokenSecret, {
    subject: id,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const signResetToken = ({ email }) => {
  if (!resetTokenSecret) {
    throw new Error('RESET_JWT_SECRET is not defined');
  }

  return jwt.sign({ email, purpose: 'password-reset' }, resetTokenSecret, {
    expiresIn: process.env.RESET_TOKEN_EXPIRES_IN || '15m',
  });
};

const verifyAccessToken = (token) => {
  if (!accessTokenSecret) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.verify(token, accessTokenSecret);
};

const verifyResetToken = (token) => {
  if (!resetTokenSecret) {
    throw new Error('RESET_JWT_SECRET is not defined');
  }

  return jwt.verify(token, resetTokenSecret);
};

export { signAccessToken, signResetToken, verifyAccessToken, verifyResetToken };
