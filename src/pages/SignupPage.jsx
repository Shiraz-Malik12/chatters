import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import Input from '../components/Input';
import { signup } from '../api/auth';

const initialForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const SignupPage = () => {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) nextErrors.name = 'Name is required';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    if (!form.password) nextErrors.password = 'Password is required';
    if (form.password.length < 8) nextErrors.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';

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
      await signup(form);
      toast.success('Account created. Please log in.');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Create account"
      title="Join Chatters"
      description="Create your account with a secure password and start using the protected dashboard."
      footer={<p className="text-sm text-slate-300">Already have an account? <Link className="text-cyan-300 underline-offset-4 hover:underline" to="/login">Log in</Link></p>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input label="Full name" name="name" value={form.name} onChange={handleChange} placeholder="Your name" error={errors.name} />
        <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" error={errors.email} />
        <Input label="Password" name="password" type="password" value={form.password} onChange={handleChange} placeholder="Minimum 8 characters" error={errors.password} />
        <Input label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="Re-enter password" error={errors.confirmPassword} />
        <Button type="submit" loading={loading}>
          <span className="mr-2 inline-flex items-center gap-2"><Icon icon="mdi:account-plus-outline" /> Sign up</span>
        </Button>
      </form>
    </AuthShell>
  );
};

export default SignupPage;