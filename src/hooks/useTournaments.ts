import { useContext } from 'react';
import { TournamentContext, TournamentContextType } from '@/contexts/TournamentContext';

export const useTournaments = (): TournamentContextType => {
  const context = useContext(TournamentContext);
  if (context === undefined) {
    throw new Error('useTournaments must be used within a TournamentProvider');
  }
  return context;
};