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
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { hapticMedium } from '@/utils/haptics';
import { useLeagueSignupsTab } from './useLeagueSignupsTab';
import type { LeagueEvent } from './signupsTypes';

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
      className="flex-row bg-surface rounded-[12px] mx-4 mb-3 border border-divider overflow-hidden"
    >
      {/* Date badge */}
      <View className="w-[60px] items-center justify-center py-4 bg-brand-teal">
        <AppText className="text-[11px] font-bold text-on-brand-teal uppercase">
          {event.month_abbr}
        </AppText>
        <AppText className="text-[22px] font-bold text-on-brand-teal leading-tight">
          {event.day}
        </AppText>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 py-3">
        <AppText className="text-[14px] font-bold text-default mb-[2px]">
          {event.title}
        </AppText>
        <AppText className="text-[12px] text-muted">
          {event.time_label}
        </AppText>
        {event.court_name != null && (
          <AppText className="text-[12px] text-muted">
            {event.court_name}
          </AppText>
        )}

        {/* Tags */}
        <View className="flex-row flex-wrap gap-1 mt-2">
          {spotsLabel != null && (
            <View
              className={`rounded-[6px] px-2 py-[2px] ${
                (event.spots_remaining ?? 0) <= 3
                  ? 'bg-warning-tint'
                  : 'bg-elevated'
              }`}
            >
              <AppText
                className={`text-[10px] font-semibold ${
                  (event.spots_remaining ?? 0) <= 3
                    ? 'text-warning'
                    : 'text-muted'
                }`}
              >
                {spotsLabel}
              </AppText>
            </View>
          )}
          {event.spots_remaining === 0 && (
            <View className="bg-danger-tint rounded-[6px] px-2 py-[2px]">
              <AppText className="text-[10px] font-semibold text-danger">
                Full
              </AppText>
            </View>
          )}
        </View>

        {/* Action */}
        <View className="mt-3">
          {event.user_status === 'signed_up' ? (
            <View className="flex-row items-center justify-between">
              <View className="bg-success-tint rounded-[6px] px-3 py-[5px]">
                <AppText className="text-[12px] font-semibold text-success">
                  Signed Up
                </AppText>
              </View>
              <Pressable
                testID={`drop-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onDrop(event.id);
                }}
                className="px-3 py-[5px] rounded-[6px] border border-danger-tint active:opacity-70"
              >
                <AppText className="text-[12px] font-semibold text-danger">
                  Drop
                </AppText>
              </Pressable>
            </View>
          ) : event.user_status === 'waitlisted' ? (
            <View className="flex-row items-center justify-between">
              <View className="bg-warning-tint rounded-[6px] px-3 py-[5px]">
                <AppText className="text-[12px] font-semibold text-warning">
                  Waitlisted
                </AppText>
              </View>
              <Pressable
                testID={`drop-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onDrop(event.id);
                }}
                className="px-3 py-[5px] rounded-[6px] border border-strong active:opacity-70"
              >
                <AppText className="text-[12px] text-muted">
                  Leave Waitlist
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <AppText className="text-[12px] text-muted">
                {event.attendee_count} going
              </AppText>
              <Pressable
                testID={`signup-event-btn-${event.id}`}
                onPress={() => {
                  void hapticMedium();
                  void onSignUp(event.id);
                }}
                disabled={event.spots_remaining === 0}
                className={`px-4 py-[7px] rounded-[8px] ${
                  event.spots_remaining === 0
                    ? 'bg-elevated'
                    : 'bg-brand-teal active:opacity-80'
                }`}
              >
                <AppText
                  className={`text-[12px] font-bold ${
                    event.spots_remaining === 0
                      ? 'text-tertiary'
                      : 'text-on-brand-teal'
                  }`}
                >
                  {event.spots_remaining === 0 ? 'Waitlist' : 'Join'}
                </AppText>
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
    <View className="flex-row items-center px-4 py-[12px] border-b border-divider">
      <AppText className="w-[90px] text-[13px] font-semibold text-default">
        {day}
      </AppText>
      <View className="flex-1">
        <AppText className="text-[13px] text-muted">
          {time}
        </AppText>
        {court != null && (
          <AppText className="text-[12px] text-tertiary">
            {court}
          </AppText>
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
    <AppText className="text-[12px] font-semibold text-muted uppercase tracking-wider px-4 pt-5 pb-2">
      {title}
    </AppText>
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
        <AppText className="text-[16px] font-bold text-default text-center">
          Failed to load events
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      testID="signups-tab"
      className="flex-1 bg-page"
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
          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
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
          <AppText className="text-[18px] font-bold text-default mb-2 text-center">
            No Upcoming Events
          </AppText>
          <AppText className="text-[14px] text-muted text-center">
            Check back later for scheduled sessions.
          </AppText>
        </View>
      )}
    </ScrollView>
  );
}
