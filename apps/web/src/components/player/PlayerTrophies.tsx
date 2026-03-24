'use client';

import { useState, useEffect } from 'react';
import { Trophy, Award, Flame, Target, Zap, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getPlayerAwards } from '../../services/api';
import { AWARD_CONFIG, type AwardConfig } from '../../utils/awardConstants';
import './PlayerTrophies.css';

/** Map iconName strings from AWARD_CONFIG to actual Lucide components. */
const ICONS = { Trophy, Award, Flame, Target, Zap, TrendingUp };

function getIcon(config: AwardConfig | Record<string, unknown>) {
  const iconName = (config as AwardConfig)?.iconName;
  return (iconName && ICONS[iconName as keyof typeof ICONS]) || Award;
}

/**
 * PlayerTrophies — compact display of a player's awards.
 *
 * @param {Object} props
 * @param {number} props.playerId - Player ID to fetch awards for
 * @param {boolean} [props.compact=false] - Use compact layout (for MyStatsTab)
 */
interface PlayerTrophiesProps {
  playerId: number | null | undefined;
  compact?: boolean;
}

export default function PlayerTrophies({ playerId, compact = false }: PlayerTrophiesProps) {
  const router = useRouter();
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    const fetchAwards = async () => {
      try {
        const data = await getPlayerAwards(playerId);
        if (!cancelled) setAwards(data || []);
      } catch {
        // Silently fail — trophies are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAwards();
    return () => { cancelled = true; };
  }, [playerId]);

  // Show skeleton while loading to prevent layout shift
  if (loading) {
    return (
      <div className="player-trophies player-trophies--loading">
        <div className="player-trophies__skeleton-badge" />
        <div className="player-trophies__skeleton-badge" />
      </div>
    );
  }

  if (awards.length === 0) return null;

  const handleLeagueClick = (leagueId: number | string) => {
    router.push(`/league/${leagueId}?tab=awards`);
  };

  if (compact) {
    return (
      <div className="player-trophies player-trophies--compact">
        <h3 className="player-trophies__heading">
          <Trophy size={16} />
          Trophies
        </h3>
        <div className="player-trophies__badges">
          {awards.map((award) => {
            const config = (AWARD_CONFIG[award.award_key] || {}) as AwardConfig;
            const Icon = getIcon(config);
            return (
              <button
                key={award.id}
                className={`player-trophies__badge player-trophies__badge--${config.colorClass || 'stat'}`}
                onClick={() => handleLeagueClick(award.league_id)}
                type="button"
                title={`${config.label} — ${award.season_name} (${award.league_name})`}
              >
                <Icon size={14} />
                <span className="player-trophies__badge-text">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="public-player__section">
      <h2 className="public-player__section-title">
        <Trophy size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
        Trophies
      </h2>
      <div className="player-trophies__list">
        {awards.map((award) => {
          const config = (AWARD_CONFIG[award.award_key] || {}) as AwardConfig;
          const Icon = getIcon(config);
          return (
            <button
              key={award.id}
              className={`player-trophies__card player-trophies__card--${config.colorClass || 'stat'}`}
              onClick={() => handleLeagueClick(award.league_id)}
              type="button"
            >
              <div className="player-trophies__card-icon">
                <Icon size={18} />
              </div>
              <div className="player-trophies__card-info">
                <span className="player-trophies__card-label">{config.label}</span>
                <span className="player-trophies__card-meta">
                  {award.season_name} &middot; {award.league_name}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
