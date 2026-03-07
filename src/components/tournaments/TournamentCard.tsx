import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Tournament } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTournamentPrice, getCurrencyByCountry } from "@/utils/currencyConverter";
import { Calendar, Trophy, Users, Target, ArrowRight, Clock } from 'lucide-react';
import { useTournaments } from "@/hooks/useTournaments";
import SimpleJoinModal from "./SimpleJoinModal";

interface TournamentCardProps {
  tournament: Tournament;
}

const TournamentCard = ({ tournament }: TournamentCardProps) => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { userMatches } = useTournaments();
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  // Check if user is registered
  const isRegistered = userMatches.some(m => m.tournamentId === tournament.id);

  const handleJoinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate("/login");
      return;
    }

    setJoinModalOpen(true);
  };

  // Get remaining time text
  const getRemainingTime = (date: Date): string => {
    const now = new Date();
    const tournamentDate = new Date(date);
    const diffTime = Math.abs(tournamentDate.getTime() - now.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    }
    return `${diffHours}h`;
  };

  // Get status display info
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'upcoming':
        return { text: 'Upcoming', color: 'bg-yellow-600 hover:bg-yellow-700' };
      case 'ongoing':
        return { text: 'Live', color: 'bg-red-600 hover:bg-red-700' };
      case 'completed':
        return { text: 'Completed', color: 'bg-green-600 hover:bg-green-700' };
      default:
        return { text: 'Unknown', color: 'bg-gray-600 hover:bg-gray-700' };
    }
  };

  const statusInfo = getStatusInfo(tournament.status);

  // Get tournament currency from country instead of expecting currency field
  const tournamentCurrency = tournament.country ? getCurrencyByCountry(tournament.country) : 'USD';
  const userCurrency = userProfile?.currency || 'USD';

  return (
    <>
      <Card className="bg-dark-card border-gray-800 overflow-hidden flex flex-col h-full">
        <div className="relative">
          <img
            src={tournament.bannerImage || "/netwin-logo.png"}
            alt={tournament.title}
            className="w-full h-32 sm:h-40 object-cover"
          />
          <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
            <Badge className={`text-white text-xs ${statusInfo.color}`}>
              {statusInfo.text}
            </Badge>
          </div>
          {(tournament.status === 'upcoming' || tournament.status === 'ongoing') && (
            <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3">
              <Badge variant="outline" className="bg-dark-card/70 backdrop-blur-sm border-0 text-xs">
                <Clock className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                {tournament.status === 'ongoing' ? 'Live Now' : getRemainingTime(new Date(tournament.startTime))}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 flex-1 flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base sm:text-lg line-clamp-2 flex-1 mr-2">
              {tournament.title}
            </h3>
            {tournament.country && (
              <Badge variant="outline" className="border-primary text-primary text-xs flex-shrink-0">
                {tournament.country}
              </Badge>
            )}
          </div>

          {tournament.description && (
            <p className="text-gray-400 text-xs sm:text-sm line-clamp-2 mb-3 sm:mb-4">
              {tournament.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-5">
            <div className="flex items-center text-xs sm:text-sm text-gray-400">
              <Calendar className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">{new Date(tournament.startTime).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center text-xs sm:text-sm text-gray-400">
              <Users className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">{tournament.matchType || "-"}</span>
            </div>
            <div className="flex items-center text-xs sm:text-sm text-gray-400">
              <Target className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">{tournament.map ?? "Unknown"}</span>
            </div>
            <div className="flex items-center text-xs sm:text-sm text-gray-400">
              <Trophy className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">{tournament.registeredTeams ?? 0}/{tournament.maxTeams ?? 0}</span>
            </div>
          </div>

          <div className="mt-auto pt-3 sm:pt-4 border-t border-gray-800 flex items-center justify-between">
            <div className="flex-1 mr-3">
              <div className="text-xs text-gray-400">Entry Fee</div>
              <div className="font-medium text-sm sm:text-base truncate">
                {formatTournamentPrice(tournament.entryFee, tournamentCurrency, userCurrency)}
              </div>
            </div>

            <div className="flex-1">
              <div className="text-xs text-gray-400">Prize Pool</div>
              <div className="font-medium text-green-400 text-sm sm:text-base truncate">
                {formatTournamentPrice(tournament.prizePool, tournamentCurrency, userCurrency)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3 sm:mt-4">
            <Button asChild className="flex-1 bg-gradient-to-r from-primary to-secondary text-sm">
              <Link to={`/tournaments/${tournament.id}`}>
                <span className="mr-2">View Details</span>
                <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
              </Link>
            </Button>
            {tournament.status === 'upcoming' && (
              <Button
                onClick={handleJoinClick}
                variant={isRegistered ? "secondary" : "outline"}
                disabled={isRegistered}
                className={`flex-1 ${isRegistered ? "" : "border-primary text-primary hover:bg-primary hover:text-white"} text-sm`}
              >
                {isRegistered ? "Joined" : "Join Tournament"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Join Tournament Modal */}
      <SimpleJoinModal
        tournament={tournament}
        open={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
      />
    </>
  );
};

export default TournamentCard;
