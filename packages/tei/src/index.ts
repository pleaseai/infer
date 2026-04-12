export { TeiManager } from './tei-manager'
export { TeiClient } from './tei-client'
export { PortPool } from './port-pool'
export { findTeiBinary } from './binary'

export type {
  TeiProcess,
  TeiProcessState,
  TeiManagerOptions,
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  RerankResult,
  TeiClientOptions,
} from './types'

export type { PortRange } from './port-pool'

import { TeiManager } from './tei-manager'
import type { TeiManagerOptions } from './types'

export function createTeiManager(options?: Partial<TeiManagerOptions>): TeiManager {
  return new TeiManager(options)
}
