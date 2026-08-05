/**
 * Empty state for My Games when the user has no recorded games.
 * Matches the `.empty-state-wrap` shape in the my-games wireframe:
 *   icon → title → subtitle → CTA button.
 */

import React, { useCallback } from "react";
import { useRouter } from "expo-router";
import { hapticMedium } from "@/utils/haptics";
import { routes } from "@/lib/navigation";
import EmptyState from '@/components/ui/EmptyState';
import { VolleyballIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

export default function GamesEmptyState(): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();

  const handleAddGame = useCallback(() => {
    void hapticMedium();
    router.push(routes.addGames());
  }, [router]);

  return <EmptyState
    testID="games-empty-state"
    icon={<VolleyballIcon size={48} color={palette.brandTeal} />}
    title="No Games Yet"
    description="Record your beach volleyball games to start tracking your stats and climbing the rankings."
    primaryAction={{ label: 'Add Your First Game', onPress: handleAddGame, testID: 'add-first-game-btn' }}
  />;
}
