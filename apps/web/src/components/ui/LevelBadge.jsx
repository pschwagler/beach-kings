const getLevelColor = (level) => {
  if (!level) return 'gray';
  const levelLower = level.toLowerCase();
  if (levelLower.includes('beginner') || levelLower.includes('recreational')) {
    return 'seafoam-dark';
  } else if (levelLower.includes('intermediate') || levelLower.includes('bb')) {
    return 'dusk-purple-light';
  } else if (levelLower === 'aa' || levelLower === 'a/a') {
    return 'sunset-dark';
  } else if (levelLower.includes('advanced') || levelLower.includes('a')) {
    return 'muted-red';
  } else if (levelLower.includes('open') || levelLower.includes('pro')) {
    return 'gold-dark';
  }
  return 'gray';
};

const toCapitalized = (str) => {
  if (!str) return '';
  return str
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default function LevelBadge({ level }) {
  return (
    <span className={`level-badge level-badge-${getLevelColor(level)}`}>
      {toCapitalized(level || 'Unknown')}
    </span>
  );
}


