import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { X, AlertTriangle } from 'lucide-react-native';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmLeaveModal({ isOpen, onClose, onConfirm }: ConfirmLeaveModalProps) {
  const theme = useTamaguiTheme();

  if (!isOpen) {
    return null;
  }

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
      paddingVertical: theme.spacing.md,
    },
    alertContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    alertIcon: {
      marginTop: 2,
    },
    message: {
      fontSize: theme.fontSize.base,
      lineHeight: 24,
      color: theme.colors.textPrimary,
      flex: 1,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
      marginTop: theme.spacing.lg,
    },
    cancelButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.gray300,
      backgroundColor: 'transparent',
    },
    cancelButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.gray700,
    },
    confirmButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.danger,
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
              <Text style={styles.title}>Unsaved Changes</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <X size={20} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.body}>
              <View style={styles.alertContainer}>
                <AlertTriangle size={24} color={theme.colors.warning} style={styles.alertIcon} />
                <Text style={styles.message}>
                  You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={onConfirm}>
                <Text style={styles.confirmButtonText}>Leave Without Saving</Text>
              </Pressable>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

