/**
 * Shared court rating display for court rows and detail headers.
 */

import React from 'react';
import { View, Text } from 'react-native';

interface CourtRatingProps {
  readonly rating: number;
  readonly reviewCount: number;
  readonly starTextClassName?: string;
  readonly scoreTextClassName?: string;
  readonly countTextClassName?: string;
  readonly emptyTextClassName?: string;
  readonly showReviewWord?: boolean;
  readonly combineScoreAndCount?: boolean;
  readonly testID?: string;
}

function Stars({
  rating,
  starTextClassName,
}: {
  readonly rating: number;
  readonly starTextClassName: string;
}): React.ReactNode {
  return (
    <View className="flex-row items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          className={`${starTextClassName} ${
            star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'
          }`}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

export default function CourtRating({
  rating,
  reviewCount,
  starTextClassName = 'text-[12px]',
  scoreTextClassName = 'text-[12px] text-muted',
  countTextClassName = 'text-[12px] text-muted',
  emptyTextClassName = 'text-[12px] text-muted',
  showReviewWord = false,
  combineScoreAndCount = false,
  testID,
}: CourtRatingProps): React.ReactNode {
  if (reviewCount === 0) {
    return (
      <Text testID={testID} className={emptyTextClassName}>
        No reviews yet
      </Text>
    );
  }

  return (
    <View testID={testID} className="flex-row items-center gap-2">
      <Stars rating={rating} starTextClassName={starTextClassName} />
      {combineScoreAndCount ? (
        <Text className={scoreTextClassName}>
          {rating.toFixed(1)} ({reviewCount})
        </Text>
      ) : (
        <>
          <Text className={scoreTextClassName}>{rating.toFixed(1)}</Text>
          <Text className={countTextClassName}>
            {showReviewWord
              ? `(${reviewCount} review${reviewCount !== 1 ? 's' : ''})`
              : `(${reviewCount})`}
          </Text>
        </>
      )}
    </View>
  );
}
