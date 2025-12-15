import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { removeLeagueMember, updateLeagueMember, leaveLeague } from '../../services/api';
import ConfirmationModal from '../modal/ConfirmationModal';
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
    isLeagueMember,
    refreshMembers,
    refreshSeasons,
    updateLeague: updateLeagueInContext,
    updateMember,
    showMessage
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const { locations } = useApp();
  const router = useRouter();

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [showOnlyAdminModal, setShowOnlyAdminModal] = useState(false);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);

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
    if (typeof window === 'undefined' || !window.confirm(`Are you sure you want to remove ${playerName} from this league?`)) {
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

  const handleLeaveLeagueClick = () => {
    // Only members can leave
    if (!isLeagueMember || !leagueId) return;

    // Prevent last admin from leaving; require promoting another admin first
    const adminCount = members.filter((m) => m.role === 'admin').length;
    if (isLeagueAdmin && adminCount <= 1) {
      setShowOnlyAdminModal(true);
      return;
    }

    // Show confirmation modal
    setShowLeaveConfirmModal(true);
  };

  const handleConfirmLeaveLeague = async () => {
    if (!leagueId) return;

    try {
      await leaveLeague(leagueId);
      showMessage?.('success', `You have left ${league.name}`);
      setShowLeaveConfirmModal(false);
      // Navigate back to home leagues tab
      router.push('/home?tab=leagues');
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to leave league');
      setShowLeaveConfirmModal(false);
    }
  };

  if (!league) {
    return <LeagueDetailsSkeleton />;
  }

  return (
    <>
      <div className="league-details-new">
        <div className="league-section-header">
          <h3 className="league-section-title">League Details</h3>
          {isLeagueMember && (
            <button
              type="button"
              className="league-leave-text-button"
              onClick={handleLeaveLeagueClick}
            >
              Leave League
            </button>
          )}
        </div>
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

      <ConfirmationModal
        isOpen={showOnlyAdminModal}
        onClose={() => setShowOnlyAdminModal(false)}
        onConfirm={async () => {}}
        title="Cannot Leave League"
        message="You cannot leave this league as the only league admin. Please promote another player to admin before leaving."
        confirmText="OK"
        cancelText="Close"
      />

      <ConfirmationModal
        isOpen={showLeaveConfirmModal}
        onClose={() => setShowLeaveConfirmModal(false)}
        onConfirm={handleConfirmLeaveLeague}
        title="Leave League"
        message={`Are you sure you want to leave ${league?.name}?`}
        confirmText="Leave League"
        cancelText="Cancel"
      />
    </>
  );
}
