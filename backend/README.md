# Chatters Backend

Production-style Express + MongoDB authentication backend for signup, login, OTP-based password reset, JWT auth, and protected routes.

## Tech Stack

- Node.js
- Express.js
- MongoDB + Mongoose
- JWT
- bcryptjs
- Nodemailer
- CORS
- dotenv
- express-validator

## Folder Structure

- `src/config` - database and mail configuration
- `src/controllers` - request handlers
- `src/middleware` - auth, validation, and error middleware
- `src/models` - Mongoose models
- `src/routes` - API route definitions
- `src/services` - business logic
- `src/utils` - shared helpers
- `src/validators` - request validation rules

## Setup

1. Copy `.env.example` to `.env`
2. Fill in MongoDB and SMTP values
3. Install dependencies inside `backend/`
4. Run the server

```bash
npm install
npm run dev
```

## Environment Variables

- `PORT` - server port
- `CLIENT_URL` - frontend origin for CORS
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - secret for auth token
- `RESET_JWT_SECRET` - secret for password reset token
- `JWT_EXPIRES_IN` - access token expiry
- `RESET_TOKEN_EXPIRES_IN` - reset token expiry
- `SMTP_HOST` - mail server host
- `SMTP_PORT` - mail server port
- `SMTP_USER` - mail username
- `SMTP_PASS` - mail password
- `SMTP_FROM` - sender name/address

## API Routes

### Public

- `GET /api/ping` - health check
- `GET /api/health` - health status
- `POST /api/auth/signup` - create account
- `POST /api/auth/login` - login and set auth cookie
- `POST /api/auth/forgot-password` - generate and email OTP
- `POST /api/auth/verify-otp` - verify OTP and issue reset cookie
- `POST /api/auth/reset-password` - reset password after OTP verification
- `POST /api/auth/logout` - clear auth cookies

### Protected

- `GET /api/auth/me` - get current user
- `GET /api/dashboard` - sample protected dashboard route

## Request Rules

- Passwords are hashed with bcrypt before saving
- OTPs are hashed before storage
- Duplicate emails are rejected on signup
- Validation errors return `400`
- Unauthorized access returns `401`
- Duplicate email returns `409`

## Tests

Run the smoke tests:

```bash
npm test
```

The current test suite checks:

- `GET /api/ping`
- validation failure on `POST /api/auth/signup`

## Notes

- The backend currently uses HTTP-only cookies for the login token and reset token.
- Add your frontend URL to `CLIENT_URL` so CORS works correctly.
- If Nodemailer is not configured, forgot-password email sending will fail until SMTP is set up.