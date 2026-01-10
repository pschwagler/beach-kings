import React, { useState } from 'react';
import { YStack, XStack, Text } from 'tamagui';
import { Calendar, Trophy } from 'lucide-react-native';
import { formatDate } from '@beach-kings/shared';
import { Card, CardHeader, CardContent } from '../ui/Card';

interface Match {
  Result?: 'W' | 'L' | 'T';
  Partner?: string;
  'Opponent 1'?: string;
  'Opponent 2'?: string;
  Score?: string;
  Date?: string;
}

interface MyMatchesWidgetProps {
  matches?: Match[];
  currentUserPlayer?: any;
}

export function MyMatchesWidget({ matches = [], currentUserPlayer }: MyMatchesWidgetProps) {
  const [showAll, setShowAll] = useState(false);

  const getMatchResult = (match: Match) => {
    const won = match.Result === 'W';
    const score = match.Score || '0-0';
    const partner = match.Partner || 'Solo';

    const opponents = [match['Opponent 1'], match['Opponent 2']].filter(Boolean);
    const opponent = opponents.length > 0 ? opponents.join(' & ') : 'Unknown';

    return {
      won,
      score,
      partner,
      opponent,
    };
  };

  if (!matches || matches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <XStack alignItems="center" gap="$2">
            <Calendar size={20} color="$oceanBlue" />
            <Text fontSize="$6" fontWeight="700" color="$textPrimary">
              My Games
            </Text>
          </XStack>
        </CardHeader>
        <CardContent>
          <YStack alignItems="center" paddingVertical="$6" gap="$2">
            <Trophy size={40} color="$textSecondary" />
            <Text fontSize="$5" color="$textSecondary" fontWeight="600">
              No games found
            </Text>
            <Text fontSize="$4" color="$textLight" textAlign="center">
              Your recent games will appear here
            </Text>
          </YStack>
        </CardContent>
      </Card>
    );
  }

  const displayedMatches = showAll ? matches : matches.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <XStack alignItems="center" gap="$2">
          <Calendar size={20} color="$oceanBlue" />
          <Text fontSize="$6" fontWeight="700" color="$textPrimary">
            My Games
          </Text>
        </XStack>
      </CardHeader>
      <CardContent>
        <YStack gap="$2">
          {displayedMatches.map((match, idx) => {
            const result = getMatchResult(match);

            return (
              <XStack
                key={idx}
                alignItems="center"
                justifyContent="space-between"
                paddingVertical="$3"
                paddingHorizontal="$3"
                backgroundColor="$background"
                borderRadius="$3"
              >
                <YStack flex={1} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <XStack
                      width={32}
                      height={32}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={result.won ? '$success' : '$danger'}
                      borderRadius="$2"
                    >
                      <Text fontSize="$3" fontWeight="700" color="$textWhite">
                        {match.Result || '?'}
                      </Text>
                    </XStack>
                    <YStack flex={1} gap="$0.5">
                      <Text fontSize="$4" fontWeight="600" color="$textPrimary">
                        {result.score}
                      </Text>
                      <Text fontSize="$3" color="$textSecondary">
                        w/ {result.partner} vs {result.opponent}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>
                {match.Date && (
                  <Text fontSize="$3" color="$textLight">
                    {formatDate(match.Date)}
                  </Text>
                )}
              </XStack>
            );
          })}
          {matches.length > 5 && (
            <Text
              fontSize="$3"
              color="$oceanBlue"
              textAlign="center"
              marginTop="$2"
              onPress={() => setShowAll(!showAll)}
              cursor="pointer"
              fontWeight="600"
            >
              {showAll
                ? 'Show less'
                : `+${matches.length - 5} more game${matches.length - 5 !== 1 ? 's' : ''}`}
            </Text>
          )}
        </YStack>
      </CardContent>
    </Card>
  );
}

