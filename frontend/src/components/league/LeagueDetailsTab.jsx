import { useState, useEffect, useMemo } from 'react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { getLocations, removeLeagueMember, updateLeagueMember } from '../../services/api';
import { useSortedMembers } from './hooks/useSortedMembers';
import DescriptionSection from './DescriptionSection';
import PlayersSection from './PlayersSection';
import SeasonsSection from './SeasonsSection';
import LeagueInfoSection from './LeagueInfoSection';
import AddPlayersModal from './AddPlayersModal';
import CreateSeasonModal from './CreateSeasonModal';

export default function LeagueDetailsTab({ leagueId, showMessage }) {
  const {
    league,
    members,
    seasons,
    isLeagueAdmin,
    refreshMembers,
    refreshSeasons,
    updateLeague: updateLeagueInContext,
    updateMember
  } = useLeague();
  const { currentUserPlayer } = useAuth();

  const [locations, setLocations] = useState([]);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);

  // Use custom hook for sorted members
  const sortedMembers = useSortedMembers(members, currentUserPlayer);

  // Load locations on mount
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const locationsData = await getLocations();
        setLocations(locationsData);
      } catch (err) {
        console.error('Error loading locations:', err);
      }
    };
    loadLocations();
  }, []);

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
    return <div className="loading">Loading league details...</div>;
  }

  return (
    <>
      <div className="league-details-new">
        <DescriptionSection
          league={league}
          leagueId={leagueId}
          isLeagueAdmin={isLeagueAdmin}
          onUpdate={updateLeagueInContext}
          showMessage={showMessage}
        />

        <PlayersSection
          sortedMembers={sortedMembers}
          currentUserPlayer={currentUserPlayer}
          isLeagueAdmin={isLeagueAdmin}
          onAddPlayers={() => setShowAddPlayerModal(true)}
          onRoleChange={handleRoleChange}
          onRemoveMember={handleRemoveMember}
        />

        <SeasonsSection
          seasons={seasons}
          isLeagueAdmin={isLeagueAdmin}
          onCreateSeason={() => setShowCreateSeasonModal(true)}
        />

        <LeagueInfoSection league={league} locations={locations} />
      </div>

      <AddPlayersModal
        isOpen={showAddPlayerModal}
        leagueId={leagueId}
        members={members}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={handleAddPlayersSuccess}
        showMessage={showMessage}
      />

      <CreateSeasonModal
        isOpen={showCreateSeasonModal}
        leagueId={leagueId}
        onClose={() => setShowCreateSeasonModal(false)}
        onSuccess={handleCreateSeasonSuccess}
        showMessage={showMessage}
      />
    </>
  );
}
