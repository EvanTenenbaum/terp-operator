/**
 * Matchmaking domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  createBestMatches,
  createBestMatchesForSupply,
  dismissMatchmakingWorkQueueItem,
  noteMatchmakingOutreach,
  rebuildMatchesForNeed,
  rebuildMatchesForSupply,
  reopenMatchmakingMatch,
  reviewMatchmakingMatch,
  updateMatchmakingSettings,
} from './commands';
