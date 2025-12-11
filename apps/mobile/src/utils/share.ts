/**
 * Share utility functions
 */

import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function shareText(text: string, url?: string) {
  try {
    const shareContent = url ? `${text}\n${url}` : text;
    
    if (Platform.OS === 'web') {
      // Web fallback - copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareContent);
        alert('Copied to clipboard!');
      }
      return;
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(shareContent);
    } else {
      alert('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Error sharing:', error);
    alert('Error sharing content');
  }
}

export async function shareLeague(leagueId: number, leagueName: string) {
  const url = `beachleague://league/${leagueId}`;
  await shareText(`Check out ${leagueName} on Beach League!`, url);
}

export async function shareMatch(matchId: number) {
  const url = `beachleague://match/${matchId}`;
  await shareText('Check out this match on Beach League!', url);
}



