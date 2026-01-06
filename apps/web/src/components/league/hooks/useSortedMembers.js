import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to manage sorted members with current user first,
 * then admins, then alphabetically.
 * Preserves sort order when members are updated (e.g., role changes).
 */
export function useSortedMembers(members, currentUserPlayer) {
  const [sortedMembers, setSortedMembers] = useState([]);
  const lastMembersLengthRef = useRef(0);

  const sortMembers = useCallback((membersToSort) => {
    if (!membersToSort.length) return [];

    const currentUserMember = currentUserPlayer
      ? membersToSort.find(m => m.player_id === currentUserPlayer.id)
      : null;

    const otherMembers = membersToSort.filter(
      m => !currentUserPlayer || m.player_id !== currentUserPlayer.id
    );

    // Sort other members: admins first, then alphabetically
    const sortedOtherMembers = [...otherMembers].sort((a, b) => {
      // Admins first
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      // Then alphabetically by name
      const nameA = (a.player_name || '').toLowerCase();
      const nameB = (b.player_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Put current user first if they exist
    return currentUserMember
      ? [currentUserMember, ...sortedOtherMembers]
      : sortedOtherMembers;
  }, [currentUserPlayer]);

  // Only re-sort when members length changes (new players added)
  // When length is the same, just update members in place
  useEffect(() => {
    if (members.length !== lastMembersLengthRef.current) {
      // Length changed - re-sort
      lastMembersLengthRef.current = members.length;
      setSortedMembers(sortMembers(members));
    } else {
      // Length same - update in place (preserve order)
      setSortedMembers(prev => {
        const membersMap = new Map(members.map(m => [m.id, m]));
        return prev.map(member => {
          const updated = membersMap.get(member.id);
          return updated || member;
        });
      });
    }
  }, [members, sortMembers]);

  return sortedMembers;
}
