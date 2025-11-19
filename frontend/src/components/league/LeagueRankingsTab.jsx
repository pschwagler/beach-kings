import { Trophy } from 'lucide-react';

export default function LeagueRankingsTab() {
  return (
    <div className="league-section">
      <div className="empty-state">
        <Trophy size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <p>Rankings will be displayed here once matches are played.</p>
      </div>
    </div>
  );
}


