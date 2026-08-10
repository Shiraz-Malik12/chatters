# Chatters

MERN auth app with a React frontend and an Express/MongoDB backend.

## What Is Included

- Signup
- Login
- Forgot password with OTP email flow
- OTP verification
- Password reset
- JWT-based session persistence
- Protected dashboard route
- Dark theme UI

## Folder Layout

- `src/` - React frontend
- `backend/` - Express + MongoDB backend

## Environment Files

Frontend:

- Copy [.env.example](.env.example) to `.env`
- Set `VITE_API_URL` to your backend URL

Backend:

- Copy [backend/.env.example](backend/.env.example) to `backend/.env`
- Set MongoDB, JWT, and SMTP values

## Install

Install the frontend dependencies from the project root:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend
npm install
```

## Run Locally

Start the backend in one terminal:

```bash
npm run backend:dev
```

Start the frontend in another terminal:

```bash
npm run dev
```

## Test

Run backend smoke tests:

```bash
npm run backend:test
```

Build the frontend:

```bash
npm run build
```

## Backend Notes

The backend uses HTTP-only cookies for auth and reset sessions. If SMTP is not configured, the forgot-password OTP email flow will not send real emails until you add valid mail credentials.
