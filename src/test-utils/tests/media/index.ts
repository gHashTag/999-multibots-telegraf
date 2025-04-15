import { TestFunction } from '../../types'
import { uploadVideoTest } from './uploadVideo.test'
import { lipSyncTest } from './lipSync.test'
import { neuroCoderTest } from './neuroCoder.test'

export const mediaTests: Record<string, TestFunction> = {
  uploadVideo: uploadVideoTest,
  lipSync: lipSyncTest,
  neuroCoder: neuroCoderTest,
}
