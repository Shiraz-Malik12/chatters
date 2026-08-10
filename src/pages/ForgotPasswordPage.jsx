import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import Input from '../components/Input';
import { forgotPassword } from '../api/auth';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError('Email is required');
      toast.error('Email is required');
      return;
    }

    try {
      setLoading(true);
      await forgotPassword({ email });
      toast.success('OTP sent to your email');
      navigate('/verify-otp', { state: { email } });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Recover access"
      title="Forgot your password?"
      description="Enter your email and we will send you a one-time password reset code."
      footer={<p className="text-sm text-slate-300"><Link className="text-cyan-300 underline-offset-4 hover:underline" to="/login">Back to login</Link></p>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" error={error} />
        <Button type="submit" loading={loading}>
          <span className="mr-2 inline-flex items-center gap-2"><Icon icon="mdi:email-fast-outline" /> Send OTP</span>
        </Button>
      </form>
    </AuthShell>
  );
};

export default ForgotPasswordPage;