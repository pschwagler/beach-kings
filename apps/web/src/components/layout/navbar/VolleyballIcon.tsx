import { Volleyball } from 'lucide-react';

interface VolleyballIconProps {
  className?: string;
}

export default function VolleyballIcon({ className = '' }: VolleyballIconProps) {
  return <Volleyball className={className} size={20} />;
}
