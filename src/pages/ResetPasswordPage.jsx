import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import Input from '../components/Input';
import { resetPassword } from '../api/auth';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!form.newPassword) nextErrors.newPassword = 'Password is required';
    if (form.newPassword.length < 8) nextErrors.newPassword = 'Password must be at least 8 characters';
    if (form.newPassword !== form.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    try {
      setLoading(true);
      await resetPassword({ newPassword: form.newPassword, confirmPassword: form.confirmPassword });
      toast.success('Password reset successfully');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Choose a new password"
      description="Use a strong password and keep it private."
      footer={<p className="text-sm text-slate-300"><Link className="text-cyan-300 underline-offset-4 hover:underline" to="/login">Return to login</Link></p>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input label="New password" type="password" name="newPassword" value={form.newPassword} onChange={handleChange} placeholder="Minimum 8 characters" error={errors.newPassword} />
        <Input label="Confirm password" type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Re-enter password" error={errors.confirmPassword} />
        <Button type="submit" loading={loading}>
          <span className="mr-2 inline-flex items-center gap-2"><Icon icon="mdi:lock-reset" /> Reset password</span>
        </Button>
      </form>
    </AuthShell>
  );
};

export default ResetPasswordPage;