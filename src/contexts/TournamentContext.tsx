import React from "react";
import { createContext, useState, useEffect, useCallback } from "react";
import { collection, addDoc, updateDoc, getDocs, getDoc, query, where, orderBy, runTransaction, writeBatch, doc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Tournament, Match, UserMatch, TeamMember } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { fromFirestoreTournament, toFirestoreTournament, FirestoreTournament } from "@/lib/tournamentConverter";
import { getCurrencyByCountry } from "@/utils/currencyConverter";
import { getAppCheckStatus } from "@/lib/appCheck";

// Helper to safely get time from string or Date
const getTimeSafe = (date: string | Date) => {
  if (typeof date === 'string') return new Date(date).getTime();
  return date.getTime();
};

export interface TournamentContextType {
  tournaments: Tournament[];
  loading: boolean;
  error: string | null;
  userMatches: UserMatchExtended[];
  fetchTournaments: () => Promise<void>;
  fetchUserMatches: () => Promise<void>;
  joinTournament: (tournamentId: string, teammates?: string[], gameIdOverride?: string, teamName?: string, teamMembers?: TeamMember[]) => Promise<boolean>;
  getTournament: (tournamentId: string) => Tournament | undefined;
  getMatch: (matchId: string) => Match | undefined;
  cleanupOrphanedUserMatches: () => Promise<void>;
  // Admin operations
  createTournament: (tournamentData: Omit<Tournament, "id">) => Promise<void>;
  updateTournament: (tournamentId: string, tournamentData: Partial<Tournament>) => Promise<void>;
  deleteTournament: (tournamentId: string) => Promise<void>;
}

const TournamentContext = createContext<TournamentContextType>({
  tournaments: [],
  loading: false,
  error: null,
  userMatches: [],
  fetchTournaments: async () => { },
  fetchUserMatches: async () => { },
  joinTournament: async () => false,
  getTournament: () => undefined,
  getMatch: () => undefined,
  cleanupOrphanedUserMatches: async () => { },
  // Admin operations
  createTournament: async () => { },
  updateTournament: async () => { },
  deleteTournament: async () => { },
});

export { TournamentContext };

interface TournamentProviderProps {
  children: React.ReactNode;
}

// Extended type for UserMatch with optional fields for UI/logic
export type UserMatchExtended = UserMatch & {
  teamMembers?: TeamMember[];
  teammates?: string[];
  teamName?: string;
  roomId?: string;
  roomPassword?: string;
  endTime?: Date | string;
  resultSubmitted?: boolean;
  resultVerified?: boolean;
  resultImageUrl?: string;
};

export const TournamentProvider = ({ children }: TournamentProviderProps) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  // Use UserMatchExtended for userMatches state
  const [userMatches, setUserMatches] = useState<UserMatchExtended[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { userProfile } = useAuth();

  const syncTournamentStatusToUserMatches = useCallback(async (tournamentId: string, newStatus: string, roomId?: string, roomPassword?: string) => {
    try {
      // Get all user matches for this tournament
      const userMatchesRef = collection(db, "user_matches");
      const q = query(
        userMatchesRef,
        where("tournamentId", "==", tournamentId)
      );

      const querySnapshot = await getDocs(q);

      // Update each user match with the new status and room details
      const batch = writeBatch(db);

      querySnapshot.docs.forEach(doc => {
        const updateData: {
          status: string;
          updatedAt: Date;
          roomId?: string;
          roomPassword?: string;
        } = {
          status: newStatus,
          updatedAt: new Date()
        };
        // Add room details if provided
        if (roomId && roomPassword) {
          updateData.roomId = roomId;
          updateData.roomPassword = roomPassword;
        }

        batch.update(doc.ref, updateData);
      });

      await batch.commit();
    } catch (error) {
      // Failed to sync tournament status to user matches
    }
  }, []);

  const fetchTournaments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const tournamentsRef = collection(db, "tournaments");
      const q = query(
        tournamentsRef,
        orderBy("createdAt", "desc")
      );

      const querySnapshot = await getDocs(q);
      const tournamentsData = querySnapshot.docs.map(doc => {
        const data = doc.data();

        // Convert timestamps to dates
        const processedData = {
          ...data,
          startTime: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime || Date.now()),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };

        // Use the tournamentConverter to standardize the mapping
        const tournament = fromFirestoreTournament(processedData as unknown as FirestoreTournament, doc.id);

        // Respect manually set statuses and only auto-update if status is 'upcoming'
        const now = new Date();
        const startTime = new Date(tournament.startTime);
        const estimatedDuration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
        const endTime = new Date(getTimeSafe(startTime) + estimatedDuration);

        let updatedStatus = tournament.status;

        // Don't override manually set statuses - respect admin/system decisions
        if (tournament.status === 'completed' || tournament.status === 'cancelled' || tournament.status === 'live') {
          updatedStatus = tournament.status;

          // If tournament is manually set to 'live', sync to user_matches
          if (tournament.status === 'live') {
            syncTournamentStatusToUserMatches(tournament.id, tournament.status, tournament.roomId, tournament.roomPassword);
          }
        } else if (tournament.status === 'upcoming') {
          // Only auto-update if status is 'upcoming'
          if (now >= startTime && now < endTime) {
            updatedStatus = 'live';
            // Sync status change to user_matches
            syncTournamentStatusToUserMatches(tournament.id, 'live', tournament.roomId, tournament.roomPassword);

            // Update tournament status in Firestore
            updateDoc(doc.ref, {
              status: updatedStatus,
              updatedAt: new Date()
            }).catch(() => {
              // Failed to update tournament status
            });
          } else if (now >= endTime) {
            updatedStatus = 'completed';
            // Sync status change to user_matches
            syncTournamentStatusToUserMatches(tournament.id, 'completed');

            // Update tournament status in Firestore
            updateDoc(doc.ref, {
              status: updatedStatus,
              updatedAt: new Date()
            }).catch(() => {
              // Failed to update tournament status
            });
          }
        }

        return {
          ...tournament,
          status: updatedStatus
        };
      });

      setTournaments(tournamentsData);
    } catch (err) {

      setError("Failed to fetch tournaments");
    } finally {
      setLoading(false);
    }
  }, [syncTournamentStatusToUserMatches]);

  const joinTournament = async (tournamentId: string, teammates: string[] = [], gameIdOverride?: string, teamName?: string, teamMembers?: TeamMember[]): Promise<boolean> => {
    if (!userProfile) {
      setError("User not authenticated");
      return false;
    }

    try {
      console.log("[TournamentContext] Starting joinTournament for:", tournamentId, "User UID:", userProfile.uid);

      setLoading(true);
      setError(null);

      // Get tournament details
      const tournament = tournaments.find(t => t.id === tournamentId);
      if (!tournament) {
        setError("Tournament not found");
        return false;
      }

      // Convert entry fee to number to be safe
      const entryFee = Number(tournament.entryFee) || 0;

      // Check if user has sufficient balance (initial check)
      if (userProfile.walletBalance < entryFee) {
        setError("Insufficient wallet balance");
        return false;
      }

      // Check if tournament is still accepting registrations
      if (tournament.status !== 'upcoming') {
        setError("Tournament registration is closed");
        return false;
      }

      // Check if user is already registered
      const existingRegistrationQuery = query(
        collection(db, "tournament_registrations"),
        where("userId", "==", userProfile.uid),
        where("tournamentId", "==", tournamentId)
      );
      const existingRegistration = await getDocs(existingRegistrationQuery);

      if (!existingRegistration.empty) {
        console.warn("[TournamentContext] User already registered for:", tournamentId);
        setError("You are already registered for this tournament");
        return false;
      }

      console.log("[TournamentContext] Proceeding with transaction for join...");

      // Perform tournament joining as a transaction
      const result = await runTransaction(db, async (transaction) => {
        // Read latest user data to get current balance
        const userRef = doc(db, "users", userProfile.uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          throw new Error("User profile not found");
        }

        const currentBalance = userDoc.data().walletBalance ?? 0;

        // Re-verify balance within transaction
        if (currentBalance < entryFee) {
          throw new Error("Insufficient wallet balance");
        }

        // Read latest tournament data to get current participants
        const tournamentRef = doc(db, "tournaments", tournamentId);
        const tournamentDoc = await transaction.get(tournamentRef);

        if (!tournamentDoc.exists()) {
          throw new Error("Tournament not found");
        }

        const latestTournament = tournamentDoc.data() || {};
        console.log("[TournamentContext] Latest tournament data from DB:", latestTournament);

        const currentParticipants = (latestTournament.currentParticipants || latestTournament.registeredPlayers) || 0;
        const registeredPlayers = latestTournament.registeredPlayers || 0;
        const maxPlayers = latestTournament.maxPlayers || latestTournament.maxTeams || 100;

        if (currentParticipants >= maxPlayers) {
          throw new Error("Tournament is full");
        }

        // Create tournament registration
        const registrationRef = doc(collection(db, "tournament_registrations"));
        transaction.set(registrationRef, {
          registrationId: registrationRef.id,
          userId: userProfile.uid,
          tournamentId: tournamentId,
          teamName: teamName || userProfile.username || userProfile.displayName || "Player",
          displayName: userProfile.username || userProfile.displayName || "Player",
          gameId: gameIdOverride || userProfile.gameId || "",
          teammates: teammates || [],
          teamMembers: teamMembers || [
            {
              id: userProfile.uid,
              userId: userProfile.uid,
              username: userProfile.username || userProfile.displayName || "Player",
              gameId: gameIdOverride || userProfile.gameId || "",
              inGameId: gameIdOverride || userProfile.gameId || "",
              isOwner: true
            },
            ...(teammates || []).map((teammate: string) => ({
              id: `teammate_${Date.now()}_${Math.random()}`,
              username: teammate,
              gameId: teammate,
              inGameId: teammate,
              isOwner: false
            }))
          ],
          registeredAt: new Date(),
          status: "registered",
          kills: 0,
          position: null,
          points: 0,
          totalPrizeEarned: 0,
          resultImageUrl: null,
          resultSubmitted: false,
          resultSubmittedAt: null,
          resultVerified: false,
          resultVerifiedAt: null,
          updatedAt: new Date()
        });

        // Create wallet transaction for entry fee (if fee > 0)
        if (entryFee > 0) {
          const tournamentCurrency = tournament.country
            ? getCurrencyByCountry(tournament.country)
            : (tournament.currency || 'USD');

          const walletTransactionRef = doc(collection(db, "transactions"));
          transaction.set(walletTransactionRef, {
            userId: userProfile.uid,
            type: "tournament_entry",
            amount: entryFee,
            currency: tournamentCurrency,
            status: "completed",
            paymentMethod: "wallet",
            description: `Tournament entry: ${latestTournament.title || latestTournament.name || tournament.title || tournament.name || "Tournament"} `,
            metadata: {
              tournamentId: tournamentId,
              tournamentTitle: latestTournament.title || latestTournament.name || tournament.title || tournament.name || "Tournament",
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Update user's wallet balance
          transaction.update(userRef, {
            walletBalance: currentBalance - entryFee,
            updatedAt: new Date()
          });
        }

        // Create user match record
        const userMatchRef = doc(collection(db, "user_matches"));
        transaction.set(userMatchRef, {
          userId: userProfile.uid,
          tournamentId: tournamentId,
          tournamentTitle: latestTournament.title || latestTournament.name || tournament.title || tournament.name || "Tournament",
          gameMode: latestTournament.gameMode || tournament.gameMode || "Solo",
          type: latestTournament.type || tournament.type || "match",
          entryFee: entryFee,
          prizePool: latestTournament.prizePool || tournament.prizePool || 0,
          status: latestTournament.status || tournament.status || "upcoming",
          startTime: latestTournament.startTime || tournament.startTime,
          registeredAt: new Date(),
          kills: 0,
          position: null,
          result: "pending",
          resultImageUrl: null,
          teamName: teamName || userProfile.username || userProfile.displayName || "Player",
          teamMembers: teamMembers || [
            {
              id: userProfile.uid,
              userId: userProfile.uid,
              username: userProfile.username || userProfile.displayName || "Player",
              gameId: gameIdOverride || userProfile.gameId || "",
              inGameId: gameIdOverride || userProfile.gameId || "",
              isOwner: true
            }
          ]
        });

        transaction.update(tournamentRef, {
          registeredPlayers: (registeredPlayers) + 1,
          currentParticipants: (currentParticipants) + 1,
          updatedAt: new Date()
        });

        console.log("[TournamentContext] Transaction operations prepared successfully");
        return true;
      });

      if (result) {
        console.log("[TournamentContext] Join transaction committed successfully!");
        // Refresh tournaments to get updated participant counts
        await fetchTournaments();

        // Refresh user matches
        await fetchUserMatches();

        return true;
      }

      console.log("[TournamentContext] Join transaction result:", result);
      return result;
    } catch (err: any) {
      console.error("[TournamentContext] Error joining tournament (Full Error):", err);
      console.error("[TournamentContext] Error Code:", err.code);
      console.error("[TournamentContext] Error Message:", err.message);

      if (err.code === 'permission-denied') {
        setError("Permission denied: You do not have permission to perform this action. Please contact support.");
      } else {
        setError(err.message || "Failed to join tournament");
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const fetchUserMatches = useCallback(async () => {
    if (!userProfile) {
      setUserMatches([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Get user matches from user_matches collection
      const userMatchesRef = collection(db, "user_matches");
      const q = query(
        userMatchesRef,
        where("userId", "==", userProfile.uid),
        orderBy("registeredAt", "desc")
      );

      console.log("[TournamentContext] Fetching matches for UID:", userProfile.uid);
      const querySnapshot = await getDocs(q);
      console.log("[TournamentContext] Found matches count:", querySnapshot.size);
      const userMatchesData = await Promise.all(querySnapshot.docs.map(async (userMatchDoc) => {
        const data = userMatchDoc.data();

        // Get the corresponding tournament to get latest status and room details
        const tournamentDoc = await getDoc(doc(db, "tournaments", data.tournamentId));
        const tournamentData = tournamentDoc.exists() ? tournamentDoc.data() as FirestoreTournament : null;

        // Get tournament registration data to fetch teammates
        const registrationRef = collection(db, "tournament_registrations");
        const registrationQuery = query(
          registrationRef,
          where("userId", "==", userProfile.uid),
          where("tournamentId", "==", data.tournamentId)
        );
        const registrationSnapshot = await getDocs(registrationQuery);
        const registrationData = registrationSnapshot.docs[0]?.data();

        return {
          id: userMatchDoc.id,
          userId: data.userId,
          tournamentId: data.tournamentId,
          tournamentTitle: data.tournamentTitle,
          gameMode: data.gameMode,
          type: data.type,
          entryFee: data.entryFee,
          prizePool: data.prizePool,
          status: tournamentData?.status || data.status,
          startTime: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime),
          registeredAt: data.registeredAt?.toDate ? data.registeredAt.toDate() : new Date(data.registeredAt),
          kills: registrationData?.kills || data.kills,
          position: registrationData?.position || data.position,
          result: registrationData?.resultSubmitted ? (registrationData?.resultVerified ? 'approved' : 'pending') : 'pending',
          // Extended fields
          roomId: tournamentData?.roomId || data.roomId || "",
          roomPassword: tournamentData?.roomPassword || data.roomPassword || "",
          teammates: registrationData?.teammates || [],
          teamMembers: registrationData?.teamMembers || [],
          teamName: registrationData?.teamName || registrationData?.displayName || "Player",
          // Add new result fields from registration
          resultSubmitted: registrationData?.resultSubmitted || false,
          resultVerified: registrationData?.resultVerified || false,
          resultImageUrl: registrationData?.resultImageUrl,
        } as UserMatchExtended;
      }));

      setUserMatches(userMatchesData);
    } catch (err) {

      setError("Failed to fetch user matches");
    } finally {
      setLoading(false);
    }
  }, [userProfile?.uid]);

  const getTournament = (tournamentId: string): Tournament | undefined => {
    return tournaments.find(t => t.id === tournamentId);
  };

  const cleanupOrphanedUserMatches = useCallback(async () => {
    if (!userProfile) return;

    try {
      // Get all user matches
      const userMatchesRef = collection(db, "user_matches");
      const userMatchesQuery = query(
        userMatchesRef,
        where("userId", "==", userProfile.uid)
      );
      const userMatchesSnapshot = await getDocs(userMatchesQuery);

      // Check each user match to see if corresponding registration exists
      const orphanedMatches: string[] = [];

      for (const userMatchDoc of userMatchesSnapshot.docs) {
        const userMatchData = userMatchDoc.data();

        // Check if registration exists
        const registrationRef = collection(db, "tournament_registrations");
        const registrationQuery = query(
          registrationRef,
          where("userId", "==", userProfile.uid),
          where("tournamentId", "==", userMatchData.tournamentId)
        );
        const registrationSnapshot = await getDocs(registrationQuery);

        // If no registration found, mark as orphaned
        if (registrationSnapshot.empty) {
          orphanedMatches.push(userMatchDoc.id);
        }
      }

      // Delete orphaned matches
      if (orphanedMatches.length > 0) {
        const batch = writeBatch(db);
        orphanedMatches.forEach(matchId => {
          const matchRef = doc(db, "user_matches", matchId);
          batch.delete(matchRef);
        });

        await batch.commit();
        // Refresh user matches after cleanup
        await fetchUserMatches();
      }
    } catch (error) {
      // Failed to cleanup orphaned user matches
    }
  }, [userProfile, fetchUserMatches]);

  // Admin CRUD operations
  const createTournament = useCallback(async (tournamentData: Omit<Tournament, "id">) => {
    try {
      setLoading(true);
      setError(null);

      // Convert to Firestore format
      const firestoreData = toFirestoreTournament({
        ...tournamentData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const docRef = await addDoc(collection(db, "tournaments"), firestoreData);

      // Use the converter for consistency
      const newTournament = {
        ...tournamentData,
        id: docRef.id
      };

      setTournaments(prev => [newTournament as Tournament, ...prev]);
    } catch (err) {

      setError("Failed to create tournament");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTournament = useCallback(async (tournamentId: string, tournamentData: Partial<Tournament>) => {
    try {
      setLoading(true);
      setError(null);

      // Convert to Firestore format
      const firestoreData = toFirestoreTournament({
        ...tournamentData,
        updatedAt: new Date()
      });

      const tournamentRef = doc(db, "tournaments", tournamentId);
      await updateDoc(tournamentRef, firestoreData);

      setTournaments(prev =>
        prev.map(tournament =>
          tournament.id === tournamentId
            ? { ...tournament, ...tournamentData, updatedAt: new Date() }
            : tournament
        )
      );
    } catch (err) {

      setError("Failed to update tournament");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteTournament = useCallback(async (tournamentId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Use a transaction to ensure all related data is deleted
      await runTransaction(db, async (transaction) => {
        const tournamentRef = doc(db, "tournaments", tournamentId);

        // Delete tournament registrations
        const registrationsRef = collection(db, "tournament_registrations");
        const registrationsQuery = query(registrationsRef, where("tournamentId", "==", tournamentId));
        const registrationsSnapshot = await getDocs(registrationsQuery);

        registrationsSnapshot.docs.forEach((doc) => {
          transaction.delete(doc.ref);
        });

        // Delete user matches for this tournament
        const userMatchesRef = collection(db, "user_matches");
        const userMatchesQuery = query(userMatchesRef, where("tournamentId", "==", tournamentId));
        const userMatchesSnapshot = await getDocs(userMatchesQuery);

        userMatchesSnapshot.docs.forEach((doc) => {
          transaction.delete(doc.ref);
        });

        // Delete the tournament itself
        transaction.delete(tournamentRef);
      });

      setTournaments(prev => prev.filter(tournament => tournament.id !== tournamentId));
      // Refresh user matches and clean up orphans
      await fetchUserMatches();
      await cleanupOrphanedUserMatches();
    } catch (err) {

      setError("Failed to delete tournament");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchUserMatches, cleanupOrphanedUserMatches]);

  const getMatch = (matchId: string): Match | undefined => {
    // First check userMatches
    const userMatch = userMatches.find(match => match.id === matchId);
    if (userMatch) {
      return {
        id: userMatch.id,
        tournamentId: userMatch.tournamentId,
        tournamentTitle: userMatch.tournamentTitle,
        date: typeof userMatch.startTime === 'string' ? new Date(userMatch.startTime) : userMatch.startTime,
        startTime: typeof userMatch.startTime === 'string' ? new Date(userMatch.startTime) : userMatch.startTime,
        endTime: userMatch.endTime ? (typeof userMatch.endTime === 'string' ? new Date(userMatch.endTime) : userMatch.endTime) : new Date(getTimeSafe(userMatch.startTime) + 2 * 60 * 60 * 1000),
        status: (userMatch.status === 'registered' ? 'scheduled' : (userMatch.status === 'ongoing' ? 'ongoing' : 'completed')) as 'scheduled' | 'ongoing' | 'completed',
        mode: userMatch.type as 'solo' | 'duo' | 'squad',
        map: "Erangel", // Default map
        teamMembers: userMatch.teamMembers && userMatch.teamMembers.length > 0
          ? userMatch.teamMembers.map((member: TeamMember, index: number) => ({
            id: member.isOwner ? userMatch.userId : `teammate_${index} `,
            username: member.username,
            inGameId: (member as TeamMember).inGameId || member.username,
            isOwner: member.isOwner || false,
            kills: member.isOwner ? (userMatch.kills || 0) : 0
          }))
          : [
            {
              id: userMatch.userId,
              username: userProfile?.username || userProfile?.displayName || "You",
              inGameId: userProfile?.gameId || "Your Game ID",
              isOwner: true,
              kills: userMatch.kills || 0
            },
            // Add teammates if they exist (fallback for old data)
            ...(userMatch.teammates || []).map((teammate: string, index: number) => ({
              id: `teammate_${index} `,
              username: teammate,
              inGameId: teammate,
              isOwner: false,
              kills: 0
            }))
          ],
        currency: "INR",
        participants: [],
        prize: userMatch.prizePool || 0,
        roomId: userMatch.roomId || "",
        roomPassword: userMatch.roomPassword || "",
        roomDetails: {
          roomId: userMatch.roomId || "",
          password: userMatch.roomPassword || "",
          visibleAt: new Date(userMatch.startTime.getTime() - 15 * 60 * 1000) // 15 min before
        },
        resultSubmitted: userMatch.resultSubmitted || false,
        resultApproved: userMatch.resultVerified || false,
        resultScreenshot: userMatch.resultImageUrl,
        kills: userMatch.kills || 0,
        position: userMatch.position,
      };
    }

    // If not found in userMatches, try to find in tournaments and create a match object
    const tournament = tournaments.find(t => t.id === matchId);
    if (tournament) {
      return {
        id: tournament.id,
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        date: typeof tournament.startTime === 'string' ? new Date(tournament.startTime) : tournament.startTime,
        startTime: typeof tournament.startTime === 'string' ? new Date(tournament.startTime) : tournament.startTime,
        endTime: tournament.endTime ? (typeof tournament.endTime === 'string' ? new Date(tournament.endTime) : tournament.endTime) : new Date(getTimeSafe(tournament.startTime) + 2 * 60 * 60 * 1000),
        status: tournament.status === 'upcoming' ? 'scheduled' :
          tournament.status === 'live' ? 'ongoing' :
            'completed',
        mode: tournament.type as 'solo' | 'duo' | 'squad',
        map: tournament.map || "Erangel",
        teamMembers: [],
        currency: tournament.currency || "INR",
        participants: [],
        prize: tournament.prizePool || 0,
        roomId: tournament.roomId || "",
        roomPassword: tournament.roomPassword || "",
        roomDetails: {
          roomId: tournament.roomId || "",
          password: tournament.roomPassword || "",
          visibleAt: new Date(getTimeSafe(tournament.startTime) - 15 * 60 * 1000)
        }
      };
    }

    return undefined;
  };

  // Automatically fetch tournaments when the provider mounts
  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  // Fetch user matches when userProfile becomes available
  useEffect(() => {
    if (userProfile) {
      fetchUserMatches();
    }
  }, [userProfile, fetchUserMatches]);

  return (
    <TournamentContext.Provider
      value={{
        tournaments,
        loading,
        error,
        userMatches,
        fetchTournaments,
        fetchUserMatches,
        joinTournament,
        getTournament,
        getMatch,
        cleanupOrphanedUserMatches,
        // Admin operations
        createTournament,
        updateTournament,
        deleteTournament,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
};
