// Compatibility facade: stable imports remain here while deep modules and Engine seams own behavior.
export * from './model-document-store'
export * from './model-file-catalog'
export * from './model-sync-state'
export {
  createBlankModel,
  getGlobalModelPath,
  getGlobalScryerDir,
  getProjectBaselinePath,
  getProjectImplementingPath,
  getProjectModelPath,
  getProjectPreSyncSnapshotPath,
  getProjectScryerDir,
  getProjectSyncPath,
  sanitizeProjectModelName
} from './model-store-core'
