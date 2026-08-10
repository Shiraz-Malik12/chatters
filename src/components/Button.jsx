const Button = ({ children, className = '', loading = false, type = 'button', ...props }) => {
  return (
    <button
      type={type}
      disabled={loading || props.disabled}
      className={`inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
};

export default Button;