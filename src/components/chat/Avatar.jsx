import { getInitials } from '../../utils/conversation';

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
};

const Avatar = ({ name, src, size = 'md', online = false }) => {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <span className={`relative inline-flex shrink-0 ${sizeClass}`}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 font-semibold text-slate-950">
          {getInitials(name)}
        </span>
      )}
      {online ? (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
      ) : null}
    </span>
  );
};

export default Avatar;
