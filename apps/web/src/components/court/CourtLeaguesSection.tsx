'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCourtLeagues } from '../../services/api';

interface CourtLeague {
  id: number;
  name: string;
  slug: string | null;
  gender: string | null;
  level: string | null;
  member_count: number;
}

interface CourtLeaguesSectionProps {
  slug: string;
}

export default function CourtLeaguesSection({ slug }: CourtLeaguesSectionProps) {
  const [leagues, setLeagues] = useState<CourtLeague[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCourtLeagues(slug)
      .then(setLeagues)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading || leagues.length === 0) return null;

  return (
    <div className="court-detail__leagues">
      <h2 className="court-detail__section-title">Leagues Here</h2>
      <div className="court-detail__leagues-list">
        {leagues.map((league) => (
          <Link
            key={league.id}
            href={`/league/${league.id}`}
            className="court-detail__league-card"
          >
            <div className="court-detail__league-info">
              <span className="court-detail__league-name">{league.name}</span>
              <span className="court-detail__league-meta">
                {league.member_count} member{league.member_count !== 1 ? 's' : ''}
                {league.gender && ` · ${league.gender}`}
                {league.level && ` · ${league.level}`}
              </span>
            </div>
            <span className="court-detail__league-chevron">&rsaquo;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
