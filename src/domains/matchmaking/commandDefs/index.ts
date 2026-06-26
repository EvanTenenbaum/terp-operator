/**
 * Matchmaking command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './acceptMatchmakingMatch';
import './dismissMatchmakingMatch';
import './dismissMatchmakingWorkQueueItem';
import './noteMatchmakingOutreach';
import './reopenMatchmakingMatch';
import './updateMatchmakingSettings';
