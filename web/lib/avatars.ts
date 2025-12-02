// Avatar emoji collection
export const AVATARS = [
  '🎮', '🎯', '🏆', '🎲', '🃏', '🎪', '🎨', '🎭', '🎬', '🎤',
  '🦁', '🐯', '🐻', '🦊', '🐼', '🐨', '🐶', '🐱', '🦅', '🦈',
  '🚀', '✈️', '🚁', '🚂', '🚗', '🏎️', '🚢', '⛵', '🛸', '🎈',
  '⚽', '🏀', '🎾', '🏐', '⚾', '🥎', '🏏', '🏑', '🏒', '🥌',
  '👨‍🚀', '👨‍💼', '👨‍🍳', '👨‍🎓', '👨‍🎨', '👩‍🚀', '👩‍💼', '👩‍🍳', '👩‍🎓', '👩‍🎨'
];

// Get random avatar
export function getRandomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

// Get avatar color based on index
export function getAvatarColor(index: number): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-lime-500'
  ];
  return colors[index % colors.length];
}
