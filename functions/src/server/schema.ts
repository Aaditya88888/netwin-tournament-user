// Database schema for PostgreSQL backend (optional for localhost development)
// This file is used when VITE_USE_BACKEND_API=true

import { pgTable, text, timestamp, integer, boolean, decimal } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  uid: text('uid').notNull(),
  email: text('email').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  photoURL: text('photo_url'),
  phoneNumber: text('phone_number'),
  gameId: text('game_id'),
  gameMode: text('game_mode'),
  country: text('country').notNull(),
  countryCode: text('country_code'),
  currency: text('currency').notNull().default('INR'),
  walletBalance: decimal('wallet_balance').notNull().default('0'),
  kycStatus: text('kyc_status').notNull().default('not_submitted'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tournaments = pgTable('tournaments', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  gameMode: text('game_mode').notNull(),
  entryFee: decimal('entry_fee').notNull(),
  prizePool: decimal('prize_pool').notNull(),
  maxParticipants: integer('max_participants').notNull(),
  currentParticipants: integer('current_participants').notNull().default(0),
  status: text('status').notNull().default('upcoming'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  rules: text('rules'),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id').references(() => tournaments.id),
  player1Id: text('player1_id').references(() => users.id),
  player2Id: text('player2_id').references(() => users.id),
  winnerId: text('winner_id').references(() => users.id),
  status: text('status').notNull().default('upcoming'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  completedAt: timestamp('completed_at'),
  gameMode: text('game_mode').notNull(),
  entryFee: decimal('entry_fee').notNull(),
  prizeAmount: decimal('prize_amount').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('info'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const kycDocuments = pgTable('kyc_documents', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  documentType: text('document_type').notNull(),
  documentNumber: text('document_number').notNull(),
  documentUrl: text('document_url').notNull(),
  status: text('status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
