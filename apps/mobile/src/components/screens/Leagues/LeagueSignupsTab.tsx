/**
 * LeagueSignupsTab — Sign Ups tab of the League Detail screen.
 *
 * Shows:
 *   Upcoming Events: cards with date badge, title, time, spots, action
 *   Weekly Schedule: day/time/court rows
 *
 * Wireframe ref: league-signups.html
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { hapticMedium } from '@/utils/haptics';
import { useLeagueSignupsTab } from './useLeagueSignupsTab';
import type { LeagueEvent } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------

interface EventCardProps {
  readonly event: LeagueEvent;
  readonly onSignUp: (eventId: number) => Promise<void>;
  readonly onDrop: (eventId: number) => Promise<void>;
}

function EventCard({ event, onSignUp, onDrop }: EventCardProps): React.ReactNode {
  const spotsLabel =
    event.spots_remaining != null
      ? `${event.spots_remaining} spot${event.spots_remaining === 1 ? '' : 's'} left`
      : null;

  return (
    <View
      testID={`event-card-${event.id}`}
      className="flex-row bg-white dark:bg-dark-surface rounded-[12px] mx-4 mb-3 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden"
    >
      {/* Date badge */}
      <View className="w-[60px] items-center justify-center py-4 bg-[#1a3a4a] dark:bg-brand-teal/20">
        <Text className="text-[11px] font-bold text-white dark:text-brand-teal uppercase">
          {event.month_abbr}
        </Text>
        <Text className="text-[22px] font-extrabold text-white dark:text-brand-teal leading-tight">
          {event.day}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 py-3">
        <Text className="text-[14px] font-bold text-text-default dark:text-content-primary mb-[2px]">
          {event.title}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
          {event.time_label}
        </Text>
        {event.court_name != null && (
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
            {event.court_name}
          </Text>
        )}

        {/* Tags */}
        <View className="flex-row flex-wrap gap-1 mt-2">
          {spotsLabel != null && (
            <View
              className={`rounded-[6px] px-2 py-[2px] ${
                (event.spots_remaining ?? 0) <= 3
                  ? 'bg-orange-100 dark:bg-orange-900/30'
                  : 'bg-[#f0f0f0] dark:bg-dark-elevated'
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${
                  (event.spots_remaining ?? 0) <= 3
                    ? 'text-orange-700 dark:text-orange-400'
                    : 'text-text-secondary dark:text-content-secondary'
                }`}
              >
                {spotsLabel}
              </Text>
            </View>
          )}
          {event.spots_remaining === 0 && (
            <View className="bg-red-100 dark:bg-red-900/30 rounded-[6px] px-2 py-[2px]">
              <Text className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                Full
              </Text>
            </View>
          )}
        </View>

        {/* Action */}
        <View className="mt-3">
          {event.user_status === 'signed_up' ? (
            <View className="flex-row items-center justify-between">
              <View className="bg-green-100 dark:bg-green-900/30 rounded-[6px] px-3 py-[5px]">
                <Text className="text-[12px] font-semibold text-green-700 dark:text-green-400">
                  Signed Up
                </Text>
              </View>
              <Pressable
                testID={`drop-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onDrop(event.id);
                }}
                className="px-3 py-[5px] rounded-[6px] border border-red-300 dark:border-red-700 active:opacity-70"
              >
                <Text className="text-[12px] font-semibold text-red-600 dark:text-red-400">
                  Drop
                </Text>
              </Pressable>
            </View>
          ) : event.user_status === 'waitlisted' ? (
            <View className="flex-row items-center justify-between">
              <View className="bg-yellow-100 dark:bg-yellow-900/30 rounded-[6px] px-3 py-[5px]">
                <Text className="text-[12px] font-semibold text-yellow-700 dark:text-yellow-400">
                  Waitlisted
                </Text>
              </View>
              <Pressable
                testID={`drop-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onDrop(event.id);
                }}
                className="px-3 py-[5px] rounded-[6px] border border-[#ddd] dark:border-border-strong active:opacity-70"
              >
                <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
                  Leave Waitlist
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
                {event.attendee_count} going
              </Text>
              <Pressable
                testID={`signup-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onSignUp(event.id);
                }}
                disabled={event.spots_remaining === 0}
                className={`px-4 py-[7px] rounded-[8px] ${
                  event.spots_remaining === 0
                    ? 'bg-[#ddd] dark:bg-dark-elevated'
                    : 'bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80'
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    event.spots_remaining === 0
                      ? 'text-text-muted dark:text-content-tertiary'
                      : 'text-white'
                  }`}
                >
                  {event.spots_remaining === 0 ? 'Waitlist' : 'Join'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Weekly schedule row
// ---------------------------------------------------------------------------

interface ScheduleRowProps {
  readonly day: string;
  readonly time: string;
  readonly court: string | null;
}

function ScheduleRow({ day, time, court }: ScheduleRowProps): React.ReactNode {
  return (
    <View className="flex-row items-center px-4 py-[12px] border-b border-[#f0f0f0] dark:border-border-subtle">
      <Text className="w-[90px] text-[13px] font-semibold text-text-default dark:text-content-primary">
        {day}
      </Text>
      <View className="flex-1">
        <Text className="text-[13px] text-text-secondary dark:text-content-secondary">
          {time}
        </Text>
        {court != null && (
          <Text className="text-[12px] text-text-muted dark:text-content-tertiary">
            {court}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[12px] font-semibold text-text-secondary dark:text-content-secondary uppercase tracking-wider px-4 pt-5 pb-2">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueSignupsTabProps {
  readonly leagueId: number | string;
}

export default function LeagueSignupsTab({ leagueId }: LeagueSignupsTabProps): React.ReactNode {
  const { events, schedule, isLoading, isError, onSignUp, onDrop } =
    useLeagueSignupsTab(leagueId);

  if (isLoading) {
    return (
      <View testID="signups-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="signups-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center">
          Failed to load events
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="signups-tab"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Upcoming events */}
      {events.length > 0 && (
        <>
          <SectionLabel title={`Upcoming Events (${events.length})`} />
          {events.map((e) => (
            <EventCard key={e.id} event={e} onSignUp={onSignUp} onDrop={onDrop} />
          ))}
        </>
      )}

      {/* Weekly schedule */}
      {schedule.length > 0 && (
        <>
          <SectionLabel title="Weekly Schedule" />
          <View className="bg-white dark:bg-dark-surface rounded-[12px] mx-4 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden">
            {schedule.map((row, idx) => (
              <ScheduleRow
                key={`${row.day_of_week}-${idx}`}
                day={row.day_of_week}
                time={row.time_label}
                court={row.court_name}
              />
            ))}
          </View>
        </>
      )}

      {events.length === 0 && schedule.length === 0 && (
        <View className="flex-1 items-center justify-center px-8 py-16">
          <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
            No Upcoming Events
          </Text>
          <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center">
            Check back later for scheduled sessions.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
