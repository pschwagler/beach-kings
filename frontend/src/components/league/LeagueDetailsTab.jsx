import { useState } from 'react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { removeLeagueMember, updateLeagueMember } from '../../services/api';
import { useSortedMembers } from './hooks/useSortedMembers';
import DescriptionSection from './DescriptionSection';
import PlayersSection from './PlayersSection';
import SeasonsSection from './SeasonsSection';
import LeagueInfoSection from './LeagueInfoSection';
import AddPlayersModal from './AddPlayersModal';
import CreateSeasonModal from './CreateSeasonModal';
import { LeagueDetailsSkeleton } from '../ui/Skeletons';

export default function LeagueDetailsTab() {
  const {
    league,
    members,
    seasons,
    leagueId,
    isLeagueAdmin,
    refreshMembers,
    refreshSeasons,
    updateLeague: updateLeagueInContext,
    updateMember,
    showMessage
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const { locations } = useApp();

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);

  // Use custom hook for sorted members
  const sortedMembers = useSortedMembers(members, currentUserPlayer);

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await updateLeagueMember(leagueId, memberId, newRole);
      // Update the member in place without refreshing (to preserve sort order)
      updateMember(memberId, { role: newRole });
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (memberId, playerName) => {
    if (!window.confirm(`Are you sure you want to remove ${playerName} from this league?`)) {
      return;
    }

    try {
      await removeLeagueMember(leagueId, memberId);
      await refreshMembers();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to remove player');
    }
  };

  const handleAddPlayersSuccess = async () => {
    await refreshMembers();
  };

  const handleCreateSeasonSuccess = async () => {
    await refreshSeasons();
  };

  if (!league) {
    return <LeagueDetailsSkeleton />;
  }

  return (
    <>
      <div className="league-details-new">
        <DescriptionSection
          league={league}
          onUpdate={updateLeagueInContext}
        />

        <PlayersSection
          sortedMembers={sortedMembers}
          currentUserPlayer={currentUserPlayer}
          onAddPlayers={() => setShowAddPlayerModal(true)}
          onRoleChange={handleRoleChange}
          onRemoveMember={handleRemoveMember}
        />

        <SeasonsSection
          seasons={seasons}
          onCreateSeason={() => setShowCreateSeasonModal(true)}
        />

        <LeagueInfoSection 
          league={league} 
          onUpdate={updateLeagueInContext}
        />
      </div>

      <AddPlayersModal
        isOpen={showAddPlayerModal}
        members={members}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={handleAddPlayersSuccess}
      />

      <CreateSeasonModal
        isOpen={showCreateSeasonModal}
        onClose={() => setShowCreateSeasonModal(false)}
        onSuccess={handleCreateSeasonSuccess}
      />
    </>
  );
}
