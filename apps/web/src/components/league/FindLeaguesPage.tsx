import { useState, useEffect, useMemo } from "react";
import type { Location, LeagueGender, SkillLevel } from "../../types";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, MapPin, LogIn, UserRoundPlus, Plus, X } from "lucide-react";
import FilterableTable from "../ui/FilterableTable";
import NavBar from "../layout/NavBar";
import LevelBadge from "../ui/LevelBadge";
import {
  queryLeagues,
  joinLeague,
  requestToJoinLeague,
  cancelJoinRequest,
  createLeague,
  getLocations,
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import { useModal, MODAL_TYPES } from "../../contexts/ModalContext";
import { useApp } from "../../contexts/AppContext";
import HomeMenuBar from "../home/HomeMenuBar";

/**
 * Reads recognized filter keys from URL search params and returns
 * an initial filters object (empty values are omitted).
 */
function parseInitialFilters(searchParams: URLSearchParams | ReturnType<typeof useSearchParams>): Record<string, string> {
  const keys = ['location_id', 'region_id', 'gender', 'level'];
  const filters: Record<string, string> = {};
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  return filters;
}

interface FindLeague {
  id: number;
  name: string;
  is_open: boolean;
  member_count?: number;
  level?: SkillLevel;
  gender?: LeagueGender;
  location_name?: string;
  region_name?: string;
}

export default function FindLeaguesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal, closeModal } = useModal();
  const { userLeagues, refreshLeagues } = useApp();
  const [leagues, setLeagues] = useState<FindLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>(() => parseInitialFilters(searchParams));
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [showJoinedLeagues, setShowJoinedLeagues] = useState(true);
  const [pendingRequests, setPendingRequests] = useState(new Set<number>());

  // Load locations for filters (regions are derived from locations)
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const locationsData = await getLocations();
        setLocations(locationsData || []);
      } catch (err) {
        console.error("Error loading filter data:", err);
      }
    };
    loadFilterData();
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      router.push("/");
    }
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === "view-league" && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === "create-league") {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData: Record<string, unknown>) => {
          const newLeague = await createLeague(leagueData);
          await refreshLeagues();
          router.push(`/league/${newLeague.id}?tab=details`);
        },
      });
    } else if (action === "find-leagues") {
      // Already on find leagues page
    }
  };

  // Fetch leagues when filters or pagination change
  useEffect(() => {
    const controller = new AbortController();
    const fetchLeagues = async () => {
      try {
        setLoading(true);
        const data = await queryLeagues({
          ...filters,
          include_joined: showJoinedLeagues,
          page,
          page_size: pageSize,
        }, { signal: controller.signal });
        const items = data.items || [];
        setLeagues(items);
        setTotalCount(data.total_count || 0);
        // Seed pending requests from API so state persists across navigation
        setPendingRequests(prev => {
          const next = new Set(prev);
          for (const league of items) {
            if (league.has_pending_request) next.add(league.id);
          }
          return next;
        });
      } catch (err: unknown) {
        const e = err as { name?: string; response?: { data?: { detail?: string } } };
        if (e.name === 'AbortError' || e.name === 'CanceledError') return;
        console.error("Error fetching leagues:", err);
        setMessage({ type: "error", text: "Failed to load leagues" });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchLeagues();
    return () => controller.abort();
  }, [filters, page, pageSize, showJoinedLeagues]);

  // Filter options derived from locations + fixed enums
  const filterOptions = useMemo(() => {
    // Derive unique regions from locations
    const regionMap = new Map();
    (locations || []).forEach((loc) => {
      if (loc.region_id && loc.region_name) {
        regionMap.set(loc.region_id, loc.region_name);
      }
    });

    const currentRegionId = filters.region_id;

    return {
      region_id: {
        label: "Region",
        options: Array.from(regionMap.entries())
          .map(([id, name]) => ({ value: id, label: name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      location_id: {
        label: "Location",
        options: (locations || [])
          .filter((l) => {
            if (!currentRegionId) return true;
            return l.region_id === currentRegionId;
          })
          .map((l) => ({ value: l.id, label: l.name || '' }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      gender: {
        label: "Gender",
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "coed", label: "Coed" },
        ],
      },
      level: {
        label: "Skill Level",
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "recreational", label: "Recreational" },
          { value: "intermediate", label: "Intermediate" },
          { value: "bb", label: "BB" },
          { value: "advanced", label: "Advanced" },
          { value: "a", label: "A" },
          { value: "aa", label: "AA" },
          { value: "open", label: "Open" },
          { value: "pro", label: "Pro" },
        ],
      },
    };
  }, [locations, filters]);

  const handleJoin = async (league: FindLeague) => {
    if (!isAuthenticated) {
      openAuthModal("sign-in");
      return;
    }

    try {
      if (league.is_open) {
        await joinLeague(league.id);
        setMessage({
          type: "success",
          text: `Successfully joined ${league.name}!`,
        });
        // Refetch leagues to update member counts using current filters + pagination
        const data = await queryLeagues({
          ...filters,
          include_joined: showJoinedLeagues,
          page,
          page_size: pageSize,
        });
        setLeagues(data.items || []);
        setTotalCount(data.total_count || 0);

        // Navigate to the league dashboard after a successful join
        router.push(`/league/${league.id}?tab=details`);
      } else {
        await requestToJoinLeague(league.id);
        setPendingRequests(prev => new Set(prev).add(league.id));
        setMessage({
          type: "success",
          text: `Join request submitted for ${league.name}. League admins will be notified.`,
        });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      const errorMsg = e.response?.data?.detail || "Failed to join league";
      setMessage({ type: "error", text: errorMsg });
    }
  };

  const handleCancelRequest = async (league: FindLeague) => {
    try {
      await cancelJoinRequest(league.id);
      setPendingRequests(prev => {
        const next = new Set(prev);
        next.delete(league.id);
        return next;
      });
      setMessage({
        type: "success",
        text: `Join request for ${league.name} cancelled.`,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      const errorMsg = e.response?.data?.detail || "Failed to cancel request";
      setMessage({ type: "error", text: errorMsg });
    }
  };

  /** Navigate to the league detail page. */
  const handleLeagueClick = (league: FindLeague) => {
    router.push(`/league/${league.id}`);
  };

  const renderRow = (league: FindLeague, idx: number) => {
    const locationText = league.location_name || "N/A";
    const regionText = league.region_name || "N/A";
    const isMember = Array.isArray(userLeagues) && userLeagues.some(
      (userLeague) => userLeague.id === league.id
    );

    return (
      <tr
        key={league.id || idx}
        className="leagues-table-row"
        onClick={() => handleLeagueClick(league)}
      >
        <td className="leagues-table-cell leagues-table-name-cell">
          <button
            className="leagues-table-name-button"
            onClick={(e) => {
              e.stopPropagation();
              handleLeagueClick(league);
            }}
          >
            {league.name}
          </button>
        </td>
        <td className="leagues-table-cell">
          <div className="leagues-table-location">
            <MapPin size={14} className="leagues-table-icon" />
            <span>{locationText}</span>
          </div>
        </td>
        <td className="leagues-table-cell">
          <span>{regionText}</span>
        </td>
        <td className="leagues-table-cell">
          <div className="leagues-table-members-count">
            <Users size={14} />
            <span>{league.member_count || 0}</span>
          </div>
        </td>
        <td className="leagues-table-cell">
          <LevelBadge level={league.level} />
        </td>
        <td className="leagues-table-cell">
          {league.is_open ? "Public" : "Invite Only"}
        </td>
        <td className="leagues-table-cell leagues-table-action-cell">
          {isMember ? (
            <span
              className="leagues-table-member-indicator"
              data-tooltip="You're already a member of this league"
              aria-label="You're already a member of this league"
            >
              You&apos;re a member
            </span>
          ) : pendingRequests.has(league.id) ? (
            <button
              className="leagues-table-join-button leagues-table-join-button--cancel"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelRequest(league);
              }}
            >
              <X size={14} />
              Cancel Request
            </button>
          ) : (
            <button
              className="leagues-table-join-button"
              onClick={(e) => {
                e.stopPropagation();
                handleJoin(league);
              }}
            >
              {league.is_open ? (
                <>
                  <LogIn size={14} />
                  Join
                </>
              ) : (
                <>
                  <UserRoundPlus size={14} />
                  Request to Join
                </>
              )}
            </button>
          )}
        </td>
      </tr>
    );
  };

  const renderMobileItem = (league: FindLeague, idx: number) => {
    const locationText = league.location_name || "N/A";
    const isMember = Array.isArray(userLeagues) && userLeagues.some(
      (userLeague) => userLeague.id === league.id
    );

    return (
      <div
        key={league.id || idx}
        className="find-league-card"
        onClick={() => handleLeagueClick(league)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleLeagueClick(league);
          }
        }}
      >
        <div className="find-league-card__name">{league.name}</div>
        <div className="find-league-card__meta">
          <span className="find-league-card__location">
            <MapPin size={14} className="leagues-table-icon" />
            {locationText}
          </span>
          <span className="find-league-card__members">
            <Users size={14} />
            {league.member_count || 0} members
          </span>
        </div>
        <div className="find-league-card__details">
          <LevelBadge level={league.level} />
          <span className="find-league-card__access">
            {league.is_open ? "Public" : "Invite Only"}
          </span>
        </div>
        <div className="find-league-card__action">
          {isMember ? (
            <span className="leagues-table-member-indicator">
              You&apos;re a member
            </span>
          ) : pendingRequests.has(league.id) ? (
            <button
              className="leagues-table-join-button leagues-table-join-button--cancel"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelRequest(league);
              }}
            >
              <X size={14} />
              Cancel Request
            </button>
          ) : (
            <button
              className="leagues-table-join-button"
              onClick={(e) => {
                e.stopPropagation();
                handleJoin(league);
              }}
            >
              {league.is_open ? (
                <>
                  <LogIn size={14} />
                  Join
                </>
              ) : (
                <>
                  <UserRoundPlus size={14} />
                  Request to Join
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const columns = [
    { label: "League Name" },
    { label: "Location" },
    { label: "Region" },
    { label: "Members" },
    { label: "Skill Level" },
    { label: "Access" },
    { label: "Action" },
  ];

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal("sign-in")}
        onSignUp={() => openAuthModal("sign-up")}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          {isAuthenticated && <HomeMenuBar activeTab={null} />}

          {/* Main Content Area */}
          <main className={isAuthenticated ? "home-content" : "home-content home-content--no-sidebar"}>
            <div className="profile-page-content">
              <div className="league-section find-leagues-page">
                <div className="section-header">
                  <h1 className="section-title">Find New Leagues</h1>
                  {isAuthenticated && (
                    <button
                      className="league-text-button"
                      onClick={() => handleLeaguesMenuClick("create-league")}
                    >
                      <Plus size={16} />
                      Create League
                    </button>
                  )}
                </div>

                {!isAuthenticated && (
                  <div className="find-leagues-auth-prompt">
                    <span className="find-leagues-auth-prompt__text">
                      <button className="find-leagues-auth-prompt__link" onClick={() => openAuthModal("sign-in")} aria-label="Log in to Beach League">Log in</button>
                      {' or '}
                      <button className="find-leagues-auth-prompt__link" onClick={() => openAuthModal("sign-up")} aria-label="Sign up for Beach League">sign up</button>
                      {' to join leagues and track your stats'}
                    </span>
                  </div>
                )}

                {message && (
                  <div
                    className={`league-message ${message.type}`}
                    style={{ marginBottom: "20px" }}
                  >
                    {message.text}
                  </div>
                )}

                <FilterableTable
                  data={leagues || []}
                  columns={columns}
                  renderRow={renderRow}
                  renderMobileItem={renderMobileItem}
                  emptyMessage="No leagues found. Try adjusting your filter to see more leagues."
                  searchPlaceholder="Search leagues..."
                  filters={filters}
                  filterOptions={filterOptions}
                  extraFiltersContent={
                    isAuthenticated && (
                      <label className="find-leagues-toggle">
                        <input
                          type="checkbox"
                          checked={showJoinedLeagues}
                          onChange={(e) => {
                            setPage(1);
                            setShowJoinedLeagues(e.target.checked);
                          }}
                        />
                        <span>Hide joined leagues</span>
                      </label>
                    )
                  }
                  onFilterChange={(newFilters) => {
                    setPage(1); // reset to first page when filters change
                    setFilters(newFilters);
                  }}
                  loading={loading}
                  page={page}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />

              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
