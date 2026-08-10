const AuthShell = ({ eyebrow, title, description, children, footer }) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] px-4 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden rounded-[2rem] border border-white/10 bg-white/5 p-10 backdrop-blur xl:flex xl:flex-col xl:justify-between">
            <div>
              <p className="mb-4 text-sm uppercase tracking-[0.4em] text-cyan-300/80">Chatters Auth</p>
              <h1 className="max-w-xl text-5xl font-black leading-tight text-white">
                Secure authentication for your production-ready MERN app.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
                Signup, login, OTP password recovery, JWT session persistence, and protected dashboard access in one clean flow.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">JWT auth with HTTP-only cookies</div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">Hashed passwords and OTPs</div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">Validated requests and clear error handling</div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur xl:p-8">
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">{eyebrow}</p>
                <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
              </div>
              {children}
              {footer ? <div className="mt-6">{footer}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthShell;