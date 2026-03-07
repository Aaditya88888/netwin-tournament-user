import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTournaments } from "@/hooks/useTournaments";
import { Tournament } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { formatTournamentPrice, convertTournamentPrice, getCurrencyByCountry } from "@/utils/currencyConverter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Users, Trophy, DollarSign } from 'lucide-react';
import type { Currency } from '../../types';

interface SimpleJoinModalProps {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
}

export default function SimpleJoinModal({
  open,
  onClose,
  tournament,
}: SimpleJoinModalProps) {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { joinTournament } = useTournaments();
  const { toast } = useToast();
  const [isJoining, setIsJoining] = useState(false);


  // Dynamic squad size based on tournament match type
  const getSquadSize = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('squad')) return 4;
    if (t.includes('trio')) return 3;
    if (t.includes('duo')) return 2;
    return 1;
  };

  const maxSquadSize = getSquadSize(tournament.matchType || 'solo');
  const [teamName, setTeamName] = useState("");
  const [teamMembers, setTeamMembers] = useState<{ username: string, inGameId: string }[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize teammates array based on squad size
  useEffect(() => {
    if (open && !hasInitialized) {
      setTeamName("");

      // Initialize members based on squad size
      const initialMembers = Array.from({ length: maxSquadSize }, (_, i) => ({
        username: i === 0 ? (userProfile?.username || userProfile?.displayName || "") : "",
        inGameId: i === 0 ? (userProfile?.gameId || "") : ""
      }));
      setTeamMembers(initialMembers);
      setHasInitialized(true);
    }

    if (!open && hasInitialized) {
      setHasInitialized(false);
    }
  }, [open, tournament, userProfile, maxSquadSize, hasInitialized]);

  // Get wallet balance
  const walletBalance = userProfile?.walletBalance ?? 0;
  // Defensive: always use a valid currency string
  const currency: Currency = (userProfile?.currency || tournament.currency || 'INR') as Currency;
  // Derive the correct currency for the tournament based on its country
  const tournamentCurrency: Currency = tournament.country
    ? getCurrencyByCountry(tournament.country)
    : (tournament.currency || 'INR') as Currency;
  const userCurrency: Currency = (userProfile?.currency || 'INR') as Currency;

  // Convert tournament entry fee to user's currency for balance comparison
  const convertedEntryFee = convertTournamentPrice(tournament.entryFee, tournamentCurrency, currency);

  // Check if user has sufficient balance
  const hasInsufficientBalance = walletBalance < convertedEntryFee;
  const handleJoin = async () => {
    if (!userProfile) {
      toast({
        title: "Error",
        description: "User profile not found. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }



    // Check if all team members have Game Name and Game ID
    const isTeamValid = teamMembers.every(m => m.username.trim() && m.inGameId.trim());
    if (!isTeamValid) {
      toast({
        title: "Incomplete Details",
        description: "Please enter Game Name and Game ID for all players.",
        variant: "destructive",
      });
      return;
    }

    // Check if Team Name is provided for non-solo matches
    if (maxSquadSize > 1 && !teamName.trim()) {
      toast({
        title: "Team Name Required",
        description: "Please enter a team name.",
        variant: "destructive",
      });
      return;
    }

    // Check wallet balance
    if (hasInsufficientBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You need ${formatCurrency(convertedEntryFee - walletBalance, currency)} more to join this tournament.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsJoining(true);

      // Prepare members data
      const membersToSend = teamMembers.map((m, i) => ({
        username: m.username.trim(),
        inGameId: m.inGameId.trim(),
        isOwner: i === 0,
        id: i === 0 ? userProfile.uid : `teammate_${Date.now()}_${i}`
      }));

      // Call joinTournament with updated signature
      const success = await joinTournament(
        tournament.id,
        membersToSend.slice(1).map(m => m.username), // Backward compatible teammates
        membersToSend[0].inGameId, // gameIdOverride
        teamName.trim(),
        membersToSend
      );
      if (success) {
        toast({
          title: "Tournament Joined!",
          description: `You have successfully joined ${tournament.title}. Entry fee of ${formatTournamentPrice(tournament.entryFee, tournamentCurrency, userCurrency)} has been deducted from your wallet.`,
        });
        onClose();

        // Navigate to My Matches
        setTimeout(() => {
          navigate("/matches");
        }, 1000);
      } else {
        toast({
          title: "Failed to Join",
          description: "Unable to join tournament. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error joining tournament:", error);
      toast({
        title: "Error",
        description: "An error occurred while joining the tournament.",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="bg-dark-card border-gray-800 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl font-bold">Join Tournament</DialogTitle>
            <DialogDescription className="text-gray-400">
              {tournament.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-1">
            {/* Tournament Info */}
            <div className="bg-dark-lighter rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-gray-400">Prize Pool</span>
                </div>
                <span className="font-semibold text-green-400">
                  {formatTournamentPrice(tournament.prizePool, tournamentCurrency, userCurrency)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-gray-400">Entry Fee</span>
                </div>
                <span className="font-semibold">
                  {formatTournamentPrice(tournament.entryFee, tournamentCurrency, userCurrency)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-400">Mode</span>
                </div>
                {/* Defensive: always use a valid matchType string */}
                <span className="font-semibold capitalize">{(tournament.matchType || 'solo').toLowerCase()}</span>
              </div>
            </div>

            {/* Wallet Balance */}
            <div className="bg-dark-lighter rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Your Wallet Balance</span>
                <span className={`font-semibold ${hasInsufficientBalance ? 'text-red-400' : 'text-green-400'}`}>
                  {formatCurrency(walletBalance, currency)}
                </span>
              </div>
            </div>

            {/* Dynamic Team Fields */}
            <div className="space-y-4">
              {maxSquadSize > 1 && (
                <div className="bg-dark-lighter rounded-lg p-4">
                  <Label htmlFor="teamName" className="text-sm text-gray-400 mb-2 block">Team Name</Label>
                  <Input
                    id="teamName"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Enter your team name"
                    className="bg-dark border-gray-700 text-white"
                  />
                </div>
              )}

              {teamMembers.map((member, index) => (
                <div key={index} className="bg-dark-lighter rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary">
                      {maxSquadSize === 1 ? "Player Details" : `Player ${index + 1}${index === 0 ? " (You)" : ""}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Game Name</Label>
                      <Input
                        value={member.username}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTeamMembers(prev => prev.map((m, i) =>
                            i === index ? { ...m, username: val } : m
                          ));
                        }}
                        placeholder="In-game Name"
                        className="bg-dark border-gray-700 text-white text-sm"
                        disabled={index === 0 && !!userProfile?.username}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Game ID</Label>
                      <Input
                        value={member.inGameId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTeamMembers(prev => prev.map((m, i) =>
                            i === index ? { ...m, inGameId: val } : m
                          ));
                        }}
                        placeholder="In-game ID"
                        className="bg-dark border-gray-700 text-white text-sm"
                        disabled={index === 0 && !!userProfile?.gameId}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Insufficient Balance Warning */}
            {hasInsufficientBalance && (
              <div className="flex items-start gap-2 bg-red-900 bg-opacity-20 text-red-400 p-3 rounded-md">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Insufficient Balance</p>
                  <p className="text-sm">
                    Add {formatCurrency(convertedEntryFee - walletBalance, currency)} more to your wallet to join this tournament.
                  </p>
                  <button
                    className="mt-2 px-3 py-1 bg-green-700 hover:bg-green-800 text-white rounded text-sm font-semibold"
                    onClick={() => {
                      window.location.href = '/wallet?addMoney=1';
                    }}
                  >
                    Add Money
                  </button>
                </div>
              </div>
            )}

            {/* Team Members (for duo/squad) */}
            {/* (Removed: No team member UI for single participant registration) */}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 border-gray-700"
                disabled={isJoining}
              >
                Cancel
              </Button>
              <Button
                onClick={handleJoin}
                disabled={
                  hasInsufficientBalance ||
                  isJoining ||
                  !teamMembers.every(m => m.username.trim() && m.inGameId.trim()) ||
                  (maxSquadSize > 1 && !teamName.trim())
                }
                className="flex-1 bg-gradient-to-r from-primary to-secondary"
              >
                {isJoining ? "Joining..." : `Join (${formatTournamentPrice(tournament.entryFee, tournamentCurrency, currency)})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </>
  );
}
