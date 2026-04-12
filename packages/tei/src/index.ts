import type { TeiManagerOptions } from './types'
import { TeiManager } from './tei-manager'

export { findTeiBinary } from './binary'
export { PortPool } from './port-pool'
export type { PortRange } from './port-pool'
export { TeiClient } from './tei-client'

export { TeiManager } from './tei-manager'

export type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  RerankResult,
  TeiClientOptions,
  TeiManagerOptions,
  TeiProcess,
  TeiProcessState,
} from './types'

export function createTeiManager(options?: Partial<TeiManagerOptions>): TeiManager {
  return new TeiManager(options)
}
