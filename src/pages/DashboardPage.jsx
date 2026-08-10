import { Icon } from '@iconify/react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Protected dashboard</p>
            <h1 className="mt-3 text-4xl font-black text-white">Welcome, {user?.name || 'User'}</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              This page is protected by JWT authentication. Refreshing the page keeps you signed in because the auth token lives in an HTTP-only cookie.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/chat"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <Icon icon="mdi:chat-outline" /> Open Chat
            </Link>
            <Button onClick={handleLogout} className="max-w-xs lg:max-w-none lg:w-auto lg:px-6">
              <span className="inline-flex items-center gap-2"><Icon icon="mdi:logout-variant" /> Logout</span>
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Name</p>
            <p className="mt-2 text-lg font-semibold text-white">{user?.name}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Email</p>
            <p className="mt-2 text-lg font-semibold text-white">{user?.email}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Role</p>
            <p className="mt-2 text-lg font-semibold text-white">{user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;