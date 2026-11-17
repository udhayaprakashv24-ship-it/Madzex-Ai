import { useState } from 'react';

interface PatientAvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PatientAvatar({ src, name, size = 'md' }: PatientAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const sizeClass =
    size === 'lg'
      ? 'w-20 h-20 text-xl rounded-3xl'
      : size === 'sm'
      ? 'w-11 h-11 text-sm rounded-2xl'
      : 'w-14 h-14 text-base rounded-2xl';

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} shrink-0 bg-[#eff4ff] border border-[#cbd5e1] text-[#0A4572] font-bold flex items-center justify-center select-none`}
        aria-label={name}
      >
        {initials || 'PT'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 object-cover border border-[#E2E8F0] bg-[#eff4ff]`}
    />
  );
}
