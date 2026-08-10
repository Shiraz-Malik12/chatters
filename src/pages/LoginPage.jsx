import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import Input from '../components/Input';
import { login } from '../api/auth';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.email.trim()) nextErrors.email = 'Email is required';
    if (!form.password) nextErrors.password = 'Password is required';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    try {
      setLoading(true);
      await login(form);
      await refreshUser();
      toast.success('Logged in successfully');
      const destination = location.state?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Chatters"
      description="Use your credentials to access the protected dashboard."
      footer={<div className="flex flex-col gap-2 text-sm text-slate-300"><p>New here? <Link className="text-cyan-300 underline-offset-4 hover:underline" to="/signup">Create an account</Link></p><p><Link className="text-cyan-300 underline-offset-4 hover:underline" to="/forgot-password">Forgot password?</Link></p></div>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" error={errors.email} />
        <Input label="Password" name="password" type="password" value={form.password} onChange={handleChange} placeholder="Your password" error={errors.password} />
        <Button type="submit" loading={loading}>
          <span className="mr-2 inline-flex items-center gap-2"><Icon icon="mdi:login-variant" /> Log in</span>
        </Button>
      </form>
    </AuthShell>
  );
};

export default LoginPage;