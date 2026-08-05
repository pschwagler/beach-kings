/**
 * Shared court rating display for court rows and detail headers.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View } from 'react-native';

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

function formatRatingLabel(rating: number): string {
  const value = Number.isInteger(rating) ? rating.toFixed(0) : rating.toFixed(1);
  return `${value} out of 5 stars`;
}

function Stars({
  rating,
  starTextClassName,
}: {
  readonly rating: number;
  readonly starTextClassName: string;
}): React.ReactNode {
  return (
    <View className="flex-row items-center gap-0.5" accessible={false}>
      {[1, 2, 3, 4, 5].map((star) => (
        <AppText
          key={star}
          accessible={false}
          className={`${starTextClassName} ${
            star <= Math.round(rating) ? 'text-accent' : 'text-tertiary'
          }`}
        >
          ★
        </AppText>
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
      <AppText testID={testID} className={emptyTextClassName}>
        No reviews yet
      </AppText>
    );
  }

  return (
    <View
      testID={testID}
      className="flex-row items-center gap-2"
      accessible
      accessibilityLabel={formatRatingLabel(rating)}
    >
      <Stars rating={rating} starTextClassName={starTextClassName} />
      {combineScoreAndCount ? (
        <AppText className={scoreTextClassName}>
          {rating.toFixed(1)} ({reviewCount})
        </AppText>
      ) : (
        <>
          <AppText className={scoreTextClassName}>{rating.toFixed(1)}</AppText>
          <AppText className={countTextClassName}>
            {showReviewWord
              ? `(${reviewCount} review${reviewCount !== 1 ? 's' : ''})`
              : `(${reviewCount})`}
          </AppText>
        </>
      )}
    </View>
  );
}
