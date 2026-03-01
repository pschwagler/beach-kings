'use client';

import { useState, useEffect } from 'react';
import { Trophy, Award, TrendingUp, Target, Flame, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getLeagueAwards } from '../../services/api';
import { AWARD_CONFIG, formatAwardValue } from '../../utils/awardConstants';
import { slugify } from '../../utils/slugify';
import './LeagueAwardsTab.css';

/** Map iconName strings from AWARD_CONFIG to actual Lucide components. */
const ICONS = { Trophy, Award, TrendingUp, Target, Flame, Zap };

function getIcon(config) {
  return ICONS[config?.iconName] || Trophy;
}

/**
 * Shared header rendered in every state (loading, error, empty, populated).
 */
function AwardsHeader() {
  return (
    <div className="awards-tab__header">
      <Award size={22} />
      <h2 className="awards-tab__title">Season Results</h2>
    </div>
  );
}

/**
 * LeagueAwardsTab — displays season awards grouped by season.
 */
export default function LeagueAwardsTab({ leagueId }) {
  const router = useRouter();
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAwards = async () => {
      try {
        setLoading(true);
        const data = await getLeagueAwards(leagueId);
        if (!cancelled) {
          setAwards(data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || 'Failed to load awards');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAwards();
    return () => { cancelled = true; };
  }, [leagueId]);

  const handlePlayerClick = (playerId, playerName) => {
    router.push(`/player/${playerId}/${slugify(playerName)}`);
  };

  if (loading) {
    return (
      <div className="awards-tab">
        <AwardsHeader />
        <div className="awards-tab__skeleton">
          <div className="awards-tab__skeleton-block" />
          <div className="awards-tab__skeleton-block" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="awards-tab">
        <AwardsHeader />
        <p className="awards-tab__error">{error}</p>
      </div>
    );
  }

  // Group awards by season_id, preserving API order (newest first)
  const seasonOrder = [];
  const seasonMap = {};
  awards.forEach((award) => {
    if (!seasonMap[award.season_id]) {
      seasonMap[award.season_id] = {
        season_id: award.season_id,
        season_name: award.season_name,
        awards: [],
      };
      seasonOrder.push(award.season_id);
    }
    seasonMap[award.season_id].awards.push(award);
  });

  const seasons = seasonOrder.map((id) => seasonMap[id]);

  if (seasons.length === 0) {
    return (
      <div className="awards-tab">
        <AwardsHeader />
        <div className="awards-tab__empty">
          <Trophy size={48} strokeWidth={1.2} />
          <h3 className="awards-tab__empty-heading">No Awards Yet</h3>
          <p className="awards-tab__empty-text">
            Awards are given when a season ends. Top 3 finishers earn podium placements, and stat leaders earn special awards.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="awards-tab">
      <AwardsHeader />

      {seasons.map((season) => {
        const placements = season.awards
          .filter((a) => a.award_type === 'placement')
          .sort((a, b) => (a.rank || 0) - (b.rank || 0));
        const statAwards = season.awards.filter((a) => a.award_type === 'stat_award');

        return (
          <div key={season.season_id} className="awards-tab__season">
            <h3 className="awards-tab__season-name">{season.season_name}</h3>

            {placements.length > 0 && (
              <div className="awards-tab__podium">
                {placements.map((award) => {
                  const config = AWARD_CONFIG[award.award_key] || {};
                  const Icon = getIcon(config);
                  return (
                    <button
                      key={award.id}
                      className={`awards-tab__podium-card awards-tab__podium-card--${config.colorClass || 'gold'}`}
                      onClick={() => handlePlayerClick(award.player_id, award.player_name)}
                      type="button"
                    >
                      <div className="awards-tab__podium-icon">
                        <Icon size={24} />
                      </div>
                      <span className="awards-tab__podium-label">{config.label}</span>
                      <span className="awards-tab__podium-player">{award.player_name}</span>
                      <span className="awards-tab__podium-value">{formatAwardValue(award.award_key, award.value)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {statAwards.length > 0 && (
              <div className="awards-tab__stats">
                {statAwards.map((award) => {
                  const config = AWARD_CONFIG[award.award_key] || {};
                  const Icon = getIcon(config);
                  return (
                    <button
                      key={award.id}
                      className="awards-tab__stat-card"
                      onClick={() => handlePlayerClick(award.player_id, award.player_name)}
                      type="button"
                    >
                      <div className="awards-tab__stat-icon">
                        <Icon size={18} />
                      </div>
                      <div className="awards-tab__stat-info">
                        <span className="awards-tab__stat-label">{config.label}</span>
                        <span className="awards-tab__stat-subtitle">{config.subtitle}</span>
                      </div>
                      <div className="awards-tab__stat-right">
                        <span className="awards-tab__stat-player">{award.player_name}</span>
                        <span className="awards-tab__stat-value">{formatAwardValue(award.award_key, award.value)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
