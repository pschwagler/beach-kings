import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { X, Trophy, Users } from 'lucide-react-native';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';

// Helper function to calculate player statistics from matches
function calculatePlayerStats(matches: any[]) {
  const playerStats: Record<string, { name: string; wins: number; losses: number; pointDifferential: number }> = {};
  
  matches.forEach(match => {
    const team1Players = [match['Team 1 Player 1'], match['Team 1 Player 2']].filter(Boolean);
    const team2Players = [match['Team 2 Player 1'], match['Team 2 Player 2']].filter(Boolean);
    const team1Score = parseInt(match['Team 1 Score']) || 0;
    const team2Score = parseInt(match['Team 2 Score']) || 0;
    
    // Determine winner from scores if not explicitly set
    let winner = match.Winner;
    if (!winner || (winner !== 'Team 1' && winner !== 'Team 2')) {
      if (team1Score > team2Score) {
        winner = 'Team 1';
      } else if (team2Score > team1Score) {
        winner = 'Team 2';
      } else {
        // Skip ties
        return;
      }
    }
    
    // Initialize player stats if not exists
    [...team1Players, ...team2Players].forEach(player => {
      if (!playerStats[player]) {
        playerStats[player] = {
          name: player,
          wins: 0,
          losses: 0,
          pointDifferential: 0
        };
      }
    });
    
    // Calculate wins/losses and point differential
    if (winner === 'Team 1') {
      team1Players.forEach(player => {
        playerStats[player].wins++;
        playerStats[player].pointDifferential += (team1Score - team2Score);
      });
      team2Players.forEach(player => {
        playerStats[player].losses++;
        playerStats[player].pointDifferential += (team2Score - team1Score);
      });
    } else if (winner === 'Team 2') {
      team2Players.forEach(player => {
        playerStats[player].wins++;
        playerStats[player].pointDifferential += (team2Score - team1Score);
      });
      team1Players.forEach(player => {
        playerStats[player].losses++;
        playerStats[player].pointDifferential += (team1Score - team2Score);
      });
    }
  });
  
  // Convert to array and sort by name
  return Object.values(playerStats).sort((a, b) => a.name.localeCompare(b.name));
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  gameCount?: number;
  playerCount?: number;
  matches?: any[];
}

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  gameCount,
  playerCount,
  matches
}: ConfirmationModalProps) {
  const theme = useTamaguiTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const playerStats = useMemo(() => {
    if (!matches || matches.length === 0) return [];
    return calculatePlayerStats(matches);
  }, [matches]);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Error during confirmation:', error);
      // Keep modal open on error
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      width: '90%',
      maxWidth: 500,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    title: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textPrimary,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    body: {
      marginBottom: theme.spacing.md,
    },
    statsContainer: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    statText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textPrimary,
    },
    playerStatsContainer: {
      marginBottom: theme.spacing.md,
    },
    statsTable: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: theme.colors.backgroundDark,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tableHeaderText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textPrimary,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tableCell: {
      flex: 1,
      fontSize: theme.fontSize.base,
      color: theme.colors.textPrimary,
    },
    tableCellName: {
      fontWeight: theme.fontWeight.medium,
    },
    message: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textPrimary,
      lineHeight: 24,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
      marginTop: theme.spacing.md,
    },
    cancelButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cancelButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textPrimary,
    },
    confirmButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.success,
    },
    confirmButtonDisabled: {
      opacity: 0.5,
    },
    confirmButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textWhite,
    },
  });

  return (
    <Modal
      visible={isOpen}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeButton} disabled={isSubmitting}>
                <X size={20} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {(gameCount !== undefined || playerCount !== undefined) && (
                <View style={styles.statsContainer}>
                  {gameCount !== undefined && (
                    <View style={styles.stat}>
                      <Trophy size={18} color={theme.colors.textPrimary} />
                      <Text style={styles.statText}>
                        {gameCount} {gameCount === 1 ? 'game' : 'games'}
                      </Text>
                    </View>
                  )}
                  {playerCount !== undefined && (
                    <View style={styles.stat}>
                      <Users size={18} color={theme.colors.textPrimary} />
                      <Text style={styles.statText}>
                        {playerCount} {playerCount === 1 ? 'player' : 'players'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              
              {playerStats.length > 0 && (
                <View style={styles.playerStatsContainer}>
                  <View style={styles.statsTable}>
                    <View style={styles.tableHeader}>
                      <Text style={styles.tableHeaderText}>Player</Text>
                      <Text style={styles.tableHeaderText}>Wins</Text>
                      <Text style={styles.tableHeaderText}>Losses</Text>
                      <Text style={styles.tableHeaderText}>Point Differential</Text>
                    </View>
                    {playerStats.map((player, idx) => (
                      <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, styles.tableCellName]}>{player.name}</Text>
                        <Text style={styles.tableCell}>{player.wins}</Text>
                        <Text style={styles.tableCell}>{player.losses}</Text>
                        <Text style={styles.tableCell}>
                          {player.pointDifferential > 0 ? '+' : ''}{player.pointDifferential}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              <Text style={styles.message}>{message}</Text>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose} disabled={isSubmitting}>
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              </Pressable>
              <Pressable 
                style={[
                  styles.confirmButton,
                  isSubmitting && styles.confirmButtonDisabled,
                ]} 
                onPress={handleConfirm} 
                disabled={isSubmitting}
              >
                <Text style={styles.confirmButtonText}>
                  {isSubmitting ? 'Submitting...' : confirmText}
                </Text>
              </Pressable>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
