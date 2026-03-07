import React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom"; // Use react-router-dom
import { useAuth } from "@/hooks/useAuth";
import { useTournaments } from "@/hooks/useTournaments";
import { useMatches } from "@/hooks/useMatches";
import { useToast } from "@/hooks/use-toast";
import type { Currency, Tournament } from "@/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Trophy, Users, Calendar, Clock, MapPin, Swords, AlertTriangle, ChevronLeft, Share2 } from 'lucide-react';
import { formatCurrency } from "@/lib/utils";
import { formatTournamentPrice, getCurrencyByCountry } from "@/utils/currencyConverter";
import SimpleJoinModal from "@/components/tournaments/SimpleJoinModal";
import PostTournamentResult from "@/components/match/PostTournamentResult";

const TournamentDetails = () => {
  const { id } = useParams<{ id: string }>(); // React Router useParams
  const navigate = useNavigate(); // React Router navigation
  const { userProfile } = useAuth();
  const { getTournament, tournaments, loading: tournamentLoading, userMatches } = useTournaments();
  const { uploadMatchResult } = useMatches();
  const { toast } = useToast();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining] = useState(false); // Remove setIsJoining if not used

  // Check if user has registered for this tournament
  const userMatch = userMatches.find(match => match.tournamentId === id);
  const hasRegistered = !!userMatch;
  const hasSubmittedResult = userMatch?.resultSubmitted || false;

  // Derive the correct currency for the tournament based on its country
  const tournamentCurrency = tournament?.country
    ? getCurrencyByCountry(tournament.country)
    : (tournament?.currency as Currency) || 'INR';
  useEffect(() => {
    if (id && tournaments.length > 0) {
      // First try to find the tournament in the loaded tournaments
      const tournamentData = getTournament(id);
      if (tournamentData) {
        setTournament(tournamentData);
      } else {
        // If not found, try to find by comparing ID strings
        const foundTournament = tournaments.find(t => t.id === id);
        setTournament(foundTournament || null);
      }
    }
  }, [id, getTournament, tournaments]);
  // Show loading if tournaments are not loaded yet or if we don't have the specific tournament
  if (!tournament && (!id || tournaments.length === 0)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading tournament details...</p>
        </div>
      </div>
    );
  }

  // Show not found if tournaments are loaded but tournament doesn&apos;t exist
  if (!tournament && tournaments.length > 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Tournament Not Found</h2>
          <p className="text-gray-400 mb-6">
            The tournament you're looking for doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate("/tournaments")}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Button>
        </div>
      </div>
    );
  }

  // Final loading check
  if (!tournament) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading tournament details...</p>
        </div>
      </div>
    );
  } const handleShare = async () => {
    try {
      await navigator.share({
        title: tournament.title,
        text: `Join ${tournament.title} tournament on Netwin!`,
        url: window.location.href
      });
    } catch (error) {
      // Share failed silently
    }
  }; return (
    <div className="container py-4 sm:py-6 lg:py-8 max-w-7xl mx-auto px-3 sm:px-4">
      {/* Back Button and Share - Mobile optimized */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button
          variant="ghost"
          className="gap-1 sm:gap-2 p-2 sm:p-3"
          onClick={() => navigate("/tournaments")}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Tournaments</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <Button
          variant="outline"
          className="gap-1 sm:gap-2 p-2 sm:p-3"
          onClick={handleShare}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>

      {/* Tournament Title and Status - Mobile responsive */}
      <div className="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold font-poppins break-words">
            {tournament.title || tournament.name || "Tournament Details"}
          </h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">
            {tournament.description || "No description available"}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Badge variant="outline" className="border-primary text-primary text-xs sm:text-sm">
            {tournament.matchType ? tournament.matchType.toUpperCase() : "SOLO"}
          </Badge>
          <Badge
            className={`text-xs sm:text-sm ${tournament.status === "upcoming"
              ? "bg-yellow-600 hover:bg-yellow-700"
              : tournament.status === "live"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-gray-600 hover:bg-gray-700"
              }`}
          >
            {tournament.status ? tournament.status.toUpperCase() : "UPCOMING"}
          </Badge>
        </div>

        {/* Join Button - Full width on mobile */}
        <Button
          className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          onClick={() => setShowJoinModal(true)}
          disabled={tournament.status !== "upcoming" || isJoining || tournamentLoading || hasRegistered}
          size="lg"
        >
          {isJoining ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Joining...
            </>
          ) :
            hasRegistered ? "Joined" :
              tournament.status === "completed" ? "Tournament Ended" :
                tournament.status === "cancelled" ? "Tournament Cancelled" :
                  tournament.status === "live" ? "Registration Closed" :
                    `Join Tournament (${formatTournamentPrice(tournament.entryFee ?? 0, tournamentCurrency, userProfile?.currency || "INR")})`}
        </Button>
      </div>      {/* Tournament Details Grid - Mobile responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Details Card */}
        <div className="bg-dark-card border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Tournament Details</h2>
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Prize Pool</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {formatTournamentPrice(tournament.prizePool || 0, tournamentCurrency, userProfile?.currency || "INR")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">1st Place</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {formatTournamentPrice(tournament.firstPrize || 0, tournamentCurrency, userProfile?.currency || "INR")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Swords className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Per Kill Reward</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {formatTournamentPrice(tournament.perKillReward || 0, tournamentCurrency, userProfile?.currency || "INR")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Entry Fee</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {formatTournamentPrice(tournament.entryFee ?? 0, tournamentCurrency, (userProfile?.currency as Currency) || 'INR')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Date</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {tournament.startTime ? new Date(tournament.startTime).toLocaleDateString() : 'TBD'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Time</div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {tournament.startTime ? new Date(tournament.startTime).toLocaleTimeString() : 'TBD'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Map</div>
                <div className="font-semibold text-sm sm:text-base truncate">{tournament.map || "TBD"}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Swords className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-400">Mode</div>
                <div className="font-semibold text-sm sm:text-base truncate">{tournament.gameType || "Classic"} - {tournament.matchType ? tournament.matchType.toUpperCase() : "SOLO"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Rules Card */}
        <div className="bg-dark-card border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Rules & Information</h2>
          <div className="space-y-3 sm:space-y-4">
            <Separator className="bg-gray-800" />
            <div>
              <h3 className="font-medium mb-2 text-sm sm:text-base">Tournament Rules</h3>
              <div className="bg-gray-900/40 rounded-lg p-3">
                <ol className="list-decimal list-inside text-gray-200 space-y-1 text-xs sm:text-sm pl-4">
                  {Array.isArray(tournament.rules)
                    ? tournament.rules.map((rule, index) => (
                      <li key={index} className="mb-1 leading-relaxed">{rule}</li>
                    ))
                    : (tournament.rules && typeof tournament.rules === 'string' && tournament.rules.trim() !== '')
                      ? tournament.rules.split(/\r?\n/).map((rule, index) => (
                        <li key={index} className="mb-1 leading-relaxed">{rule}</li>
                      ))
                      : <li>Tournament rules will be provided before the match starts.</li>}
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Prize Distribution Section */}
        {/* Removed PrizeDistributionSection from main app UI as it is admin-only */}
      </div>

      {/* Post-Tournament Result Submission */}
      {hasRegistered && tournament.status === "completed" && (
        <div className="mt-6">
          <PostTournamentResult
            tournamentTitle={tournament.title || "Tournament"}
            isCompleted={tournament.status === "completed"}
            hasSubmittedResult={hasSubmittedResult}
            onResultSubmit={async (screenshot: string, kills: number, position: number) => {
              if (!id) return false;
              const success = await uploadMatchResult(userMatch?.id || id, screenshot, kills, position);
              if (success) {
                toast({
                  title: "Result Submitted",
                  description: "Your match result has been submitted for verification.",
                });
              } else {
                toast({
                  variant: "destructive",
                  title: "Submission Failed",
                  description: "Failed to submit result. Please try again.",
                });
              }
              return success;
            }}
          />
        </div>
      )}

      {/* KYC Warning if needed */}
      {userProfile?.kycStatus !== "APPROVED" && (
        <Alert className="mt-6 bg-yellow-900/20 border-yellow-700/30 text-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>KYC Verification Required</AlertTitle>
          <AlertDescription>
            Complete your KYC verification to participate in tournaments with entry fees above {formatCurrency(100, userProfile?.currency || "INR")}.
          </AlertDescription>
        </Alert>
      )}      {/* Join Tournament Modal */}
      <SimpleJoinModal
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        tournament={tournament}
      />
    </div>
  );
};

export default TournamentDetails;