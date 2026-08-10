import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import Input from '../components/Input';
import { verifyOtp } from '../api/auth';

const VerifyOtpPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!email.trim()) nextErrors.email = 'Email is required';
    if (!/^\d{6}$/.test(otp)) nextErrors.otp = 'OTP must be 6 digits';
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error('Please enter a valid OTP');
      return;
    }

    try {
      setLoading(true);
      await verifyOtp({ email, otp });
      toast.success('OTP verified');
      navigate('/reset-password', { state: { email } });
    } catch (error) {
      toast.error(error.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Verify OTP"
      title="Enter the code"
      description="Check your email for the 6-digit code and use it here to continue."
      footer={<p className="text-sm text-slate-300"><Link className="text-cyan-300 underline-offset-4 hover:underline" to="/forgot-password">Need a new code?</Link></p>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" error={errors.email} />
        <Input label="OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" error={errors.otp} />
        <Button type="submit" loading={loading}>
          <span className="mr-2 inline-flex items-center gap-2"><Icon icon="mdi:shield-check-outline" /> Verify OTP</span>
        </Button>
      </form>
    </AuthShell>
  );
};

export default VerifyOtpPage;