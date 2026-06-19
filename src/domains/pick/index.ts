/**
 * Pick domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  allocateOrderToFulfillment,
  printLabels,
  recallLineFromPicking,
  recordWeighAndPack,
  releaseLineForPicking,
  releaseLinesForPicking,
  returnPickedUnits,
} from './commands';
