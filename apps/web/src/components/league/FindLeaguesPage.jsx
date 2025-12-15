import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Users, MapPin, Award, LogIn, UserRoundPlus } from "lucide-react";
import FilterableTable from "../ui/FilterableTable";
import LeagueMembersModal from "./LeagueMembersModal";
import NavBar from "../layout/NavBar";
import LevelBadge from "../ui/LevelBadge";
import {
  queryLeagues,
  joinLeague,
  requestToJoinLeague,
  getUserLeagues,
  getLocations,
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import { useModal, MODAL_TYPES } from "../../contexts/ModalContext";
import HomeMenuBar from "../home/HomeMenuBar";

export default function FindLeaguesPage() {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal, closeModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [message, setMessage] = useState(null);
  const [selectedLeagueForMembers, setSelectedLeagueForMembers] =
    useState(null);
  const [locations, setLocations] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [showJoinedLeagues, setShowJoinedLeagues] = useState(false);

  // Load user leagues for navbar
  useEffect(() => {
    const loadUserLeagues = async () => {
      if (isAuthenticated) {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error("Error loading user leagues:", err);
        }
      }
    };
    loadUserLeagues();
  }, [isAuthenticated]);

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

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === "view-league" && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === "create-league") {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSuccess: async (newLeague) => {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
          router.push(`/league/${newLeague.id}?tab=details`);
        },
      });
    } else if (action === "find-leagues") {
      // Already on find leagues page
    }
  };

  // Fetch leagues when filters or pagination change
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        setLoading(true);
        const data = await queryLeagues({
          ...filters,
          include_joined: showJoinedLeagues,
          page,
          page_size: pageSize,
        });
        setLeagues(data.items || []);
        setTotalCount(data.total_count || 0);
      } catch (err) {
        console.error("Error fetching leagues:", err);
        setMessage({ type: "error", text: "Failed to load leagues" });
      } finally {
        setLoading(false);
      }
    };

    fetchLeagues();
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
          .map((l) => ({ value: l.id, label: l.name }))
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

  const handleJoin = async (league) => {
    if (!isAuthenticated) {
      router.push("/");
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
        setMessage({
          type: "success",
          text: `Join request submitted for ${league.name}. League admins will be notified.`,
        });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Failed to join league";
      setMessage({ type: "error", text: errorMsg });
    }
  };

  const handleMembersClick = (league) => {
    setSelectedLeagueForMembers({
      id: league.id,
      name: league.name,
      location_name: league.location_name,
      level: league.level,
      gender: league.gender,
      member_count: league.member_count,
      is_open: league.is_open,
    });
  };

  const renderRow = (league, idx) => {
    const locationText = league.location_name || "N/A";
    const regionText = league.region_name || "N/A";
    const isMember = Array.isArray(userLeagues) && userLeagues.some(
      (userLeague) => userLeague.id === league.id
    );

    return (
      <tr
        key={league.id || idx}
        className="leagues-table-row"
        onClick={() => handleMembersClick(league)}
      >
        <td className="leagues-table-cell leagues-table-name-cell">
          <button
            className="leagues-table-name-button"
            onClick={(e) => {
              e.stopPropagation();
              handleMembersClick(league);
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
          <button
            className="leagues-table-members-button"
            onClick={(e) => {
              e.stopPropagation();
              handleMembersClick(league);
            }}
          >
            <Users size={14} />
            <span>{league.member_count || 0}</span>
          </button>
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
              title="Youre already a member of this league"
            >
              You&apos;re a member
            </span>
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

  const columns = [
    { label: "League Name" },
    { label: "Location" },
    { label: "Region" },
    { label: "Members" },
    { label: "Skill Level" },
    { label: "Access" },
    { label: "Action" },
  ];

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize) => {
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
          <HomeMenuBar activeTab={null} />

          {/* Main Content Area */}
          <main className="home-content">
            <div className="profile-page-content">
              <div className="league-section find-leagues-page">
                <div className="section-header">
                  <h1 className="section-title">Find Leagues</h1>
                </div>

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
                        <span>Show joined leagues</span>
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

                {selectedLeagueForMembers && (
                  <LeagueMembersModal
                    leagueId={selectedLeagueForMembers.id}
                    leagueName={selectedLeagueForMembers.name}
                    locationName={selectedLeagueForMembers.location_name}
                    level={selectedLeagueForMembers.level}
                    gender={selectedLeagueForMembers.gender}
                    memberCount={selectedLeagueForMembers.member_count}
                    isOpenLeague={selectedLeagueForMembers.is_open}
                    isMember={
                      Array.isArray(userLeagues) &&
                      userLeagues.some(
                        (league) => league.id === selectedLeagueForMembers.id
                      )
                    }
                    onJoin={
                      Array.isArray(userLeagues) &&
                      userLeagues.some(
                        (league) => league.id === selectedLeagueForMembers.id
                      )
                        ? undefined
                        : () => handleJoin(selectedLeagueForMembers)
                    }
                    onClose={() => setSelectedLeagueForMembers(null)}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
