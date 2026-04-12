import { describe, expect, it } from 'bun:test'
import { findTeiBinary } from './binary'

const BINARY_NAME = 'text-embeddings-router'
const INSTALL_CMD = 'brew install huggingface/tap/text-embeddings-inference'

describe('findTeiBinary', () => {
  it('returns absolute path when binary exists on $PATH', () => {
    const expectedPath = '/usr/local/bin/text-embeddings-router'
    const whichFn = (_name: string) => expectedPath

    const result = findTeiBinary(whichFn)

    expect(result).toBe(expectedPath)
  })

  it('calls which with correct binary name', () => {
    let capturedName = ''
    const whichFn = (name: string) => {
      capturedName = name
      return '/usr/local/bin/text-embeddings-router'
    }

    findTeiBinary(whichFn)

    expect(capturedName).toBe(BINARY_NAME)
  })

  it('throws with helpful message when binary not found on $PATH', () => {
    const whichFn = (_name: string) => null

    expect(() => findTeiBinary(whichFn)).toThrow(
      `${BINARY_NAME} not found on $PATH`,
    )
  })

  it('error message includes homebrew install instructions', () => {
    const whichFn = (_name: string) => null

    expect(() => findTeiBinary(whichFn)).toThrow(INSTALL_CMD)
  })

  it('uses Bun.which by default when no lookup function provided', () => {
    // Bun.which returns null if binary not on path in test env
    // We just verify it doesn't throw a TypeError (wrong argument type)
    // and throws TeiBinaryNotFoundError when not installed
    expect(() => findTeiBinary()).toThrow(
      `${BINARY_NAME} not found on $PATH`,
    )
  })
})
