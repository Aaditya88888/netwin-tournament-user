import { useState, useEffect } from "react";
import { Match, MatchResult } from "@/types";
import { useAuth } from "./useAuth";
import { useUser } from "./useUser";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScreenshotService } from "@/lib/screenshotService";

export function useMatches() {
  const { userProfile } = useAuth();
  const { squadMembers } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile) {
      loadUserMatches();
    } else {
      setLoading(false);
    }
  }, [userProfile]);

  const loadUserMatches = async () => {
    if (!userProfile) return;

    try {
      setLoading(true);

      // Get tournament registrations for the user
      const registrationsQuery = query(
        collection(db, "tournament_registrations"),
        where("userId", "==", userProfile.uid)
      );

      const registrationsSnapshot = await getDocs(registrationsQuery);
      const tournamentIds = registrationsSnapshot.docs.map(doc => doc.data().tournamentId);

      if (tournamentIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      // Get tournaments for these IDs
      const tournamentsQuery = query(collection(db, "tournaments"));
      const tournamentsSnapshot = await getDocs(tournamentsQuery);

      // Get match results for the user
      const resultsQuery = query(
        collection(db, "match_results"),
        where("userId", "==", userProfile.uid)
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const userResults = new Map<string, MatchResult>();

      resultsSnapshot.docs.forEach(doc => {
        const result = doc.data() as MatchResult;
        userResults.set(result.tournamentId, { ...result, id: doc.id });
      });

      const userMatches: Match[] = [];

      tournamentsSnapshot.docs.forEach(doc => {
        const tournamentData = doc.data();
        if (tournamentIds.includes(doc.id)) {
          // Get result data for this tournament
          const matchResult = userResults.get(doc.id);

          // Convert tournament to match format
          const match: Match = {
            id: doc.id, // Use string ID as per interface
            tournamentId: doc.id,
            tournamentTitle: tournamentData.title || tournamentData.name || "Tournament",
            date: tournamentData.startTime?.toDate?.() || new Date(tournamentData.startTime),
            startTime: tournamentData.startTime?.toDate?.() || new Date(tournamentData.startTime),
            endTime: new Date((tournamentData.startTime?.toDate?.() || new Date(tournamentData.startTime)).getTime() + 2 * 60 * 60 * 1000), // 2 hours later
            mode: (tournamentData.type || "squad").toLowerCase() as "solo" | "duo" | "squad",
            map: tournamentData.map || "Erangel",
            status: mapTournamentStatusToMatchStatus(tournamentData.status),
            participants: tournamentData.registeredTeams || 0,
            prize: tournamentData.prizePool || 0,
            currency: tournamentData.currency || "INR",
            teamMembers: squadMembers.map(member => ({
              id: String(member.id),
              username: member.username,
              inGameId: member.gameId,
              profilePicture: member.profilePicture,
              isOwner: String(member.id) === userProfile.uid,
              kills: matchResult?.kills || 0
            })),
            roomDetails: tournamentData.status === "ongoing" || tournamentData.status === "scheduled" ? {
              roomId: `NETWIN${doc.id.slice(-6).toUpperCase()}`,
              password: `NW${Date.now().toString().slice(-4)}`
            } : undefined,
            roomId: tournamentData.status === "ongoing" || tournamentData.status === "scheduled" ?
              `NETWIN${doc.id.slice(-6).toUpperCase()}` : undefined,
            roomPassword: tournamentData.status === "ongoing" || tournamentData.status === "scheduled" ?
              `NW${Date.now().toString().slice(-4)}` : undefined,
            resultSubmitted: !!matchResult,
            resultApproved: false, // matchResult?.status === "verified",
            resultScreenshot: matchResult?.screenshot,
            position: matchResult?.position, // Use the correct property from MatchResult
            kills: matchResult?.kills,
            results: []
          };

          userMatches.push(match);
        }
      });

      // Sort by date
      userMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setMatches(userMatches);
    } catch (error) {
      console.error("Error loading user matches:", error);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to map tournament status to match status
  const mapTournamentStatusToMatchStatus = (tournamentStatus: string): "scheduled" | "ongoing" | "completed" | "cancelled" => {
    switch (tournamentStatus) {
      case "upcoming":
        return "scheduled";
      case "live":
      case "ongoing":
        return "ongoing";
      case "completed":
        return "completed";
      case "cancelled":
        return "cancelled";
      default:
        return "scheduled";
    }
  };

  const getUpcomingMatches = () => {
    return matches.filter(match =>
      match.status === "scheduled" || match.status === "ongoing"
    ).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  const getCompletedMatches = () => {
    return matches.filter(match =>
      match.status === "completed"
    ).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  };
  const uploadMatchResult = async (matchId: string, screenshot: string, kills?: number, placement?: number): Promise<boolean> => {
    if (!userProfile) {
      console.error('[useMatches] No userProfile available');
      return false;
    }

    try {
      // Note: We don't need to find the match in the matches array anymore since we're working with tournament registrations
      // If screenshot is base64, upload it to Firebase Storage
      let screenshotURL = screenshot;
      if (screenshot.startsWith('data:')) {
        const uploadResult = await ScreenshotService.uploadScreenshotFromBase64(
          userProfile.uid,
          matchId,
          screenshot
        );

        if (!uploadResult.success) {
          console.error('[useMatches] Failed to upload screenshot:', uploadResult.error);
          return false;
        }

        screenshotURL = uploadResult.downloadURL!;
      }

      // Submit result to user_matches and tournament_registrations collections
      const submitResult = await ScreenshotService.submitMatchResult(
        matchId,
        screenshotURL,
        userProfile.uid,
        kills,
        placement
      );

      if (!submitResult.success) {
        console.error('[useMatches] Failed to submit match result:', submitResult.error);
        return false;
      }

      // Success! The ScreenshotService has handled updating both user_matches and tournament_registrations
      // The TournamentContext will refresh the data automatically
      return true;
    } catch (error) {
      console.error('[useMatches] Error uploading match result:', error);
      return false;
    }
  };

  return {
    matches,
    loading,
    getUpcomingMatches,
    getCompletedMatches,
    uploadMatchResult,
    refetch: loadUserMatches
  };
}
