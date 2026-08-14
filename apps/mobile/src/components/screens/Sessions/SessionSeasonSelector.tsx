import React from 'react';
import AppText from '@/components/ui/AppText';
import { TouchableOpacity, View } from 'react-native';
import type { Season } from '@beach-kings/shared';

interface Props {
  readonly seasons: readonly Season[];
  readonly selectedSeasonId: number | null;
  readonly onChange: (seasonId: number | null) => void;
  readonly testIDPrefix: string;
}

function seasonLabel(season: Season): string {
  if ((season.name ?? '').trim().length > 0) return season.name ?? '';
  return `Season ${season.id}`;
}

export default function SessionSeasonSelector({
  seasons,
  selectedSeasonId,
  onChange,
  testIDPrefix,
}: Props): React.ReactNode {
  return (
    <View testID={`${testIDPrefix}-season-selector`} className="gap-[8px] mt-[8px]">
      <TouchableOpacity
        testID={`${testIDPrefix}-season-none`}
        onPress={() => onChange(null)}
        className={`rounded-[10px] border px-3 py-[12px] ${
          selectedSeasonId == null
            ? 'border-brand-teal bg-info-tint'
            : 'border-divider bg-surface'
        }`}
      >
        <AppText
          className={`text-[14px] font-semibold ${
            selectedSeasonId == null ? 'text-brand-teal' : 'text-default'
          }`}
        >
          No season
        </AppText>
      </TouchableOpacity>

      {seasons.map((season) => {
        const selected = selectedSeasonId === season.id;
        return (
          <TouchableOpacity
            key={season.id}
            testID={`${testIDPrefix}-season-${season.id}`}
            onPress={() => onChange(season.id)}
            className={`rounded-[10px] border px-3 py-[12px] ${
              selected
                ? 'border-brand-teal bg-info-tint'
                : 'border-divider bg-surface'
            }`}
          >
            <View className="flex-row items-center justify-between gap-3">
              <AppText
                className={`text-[14px] font-semibold flex-1 ${
                  selected ? 'text-brand-teal' : 'text-default'
                }`}
                numberOfLines={1}
              >
                {seasonLabel(season)}
              </AppText>
              {season.is_active === true && (
                <AppText className="text-[11px] font-bold text-brand-teal">
                  Current
                </AppText>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
