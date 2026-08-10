const Input = ({ label, error, className = '', ...props }) => {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm font-medium text-slate-200">{label}</span> : null}
      <input
        className={`w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white/10 ${className}`}
        {...props}
      />
      {error ? <span className="text-sm text-rose-400">{error}</span> : null}
    </label>
  );
};

export default Input;