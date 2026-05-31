import type { DiagramKind, DiagramNotation } from './model-types'

export type DiagramCacheOutputProfile = 'review' | 'thumbnail' | 'export'

export type DiagramCacheKeyInput = {
  sourceHash: `sha256:${string}`
  notation: DiagramNotation
  detectedKind: DiagramKind
  theme: string
  rendererVersion: string
  outputProfile: DiagramCacheOutputProfile
}

export type DiagramCacheReadRequest = {
  projectPath: string
  modelName?: string | null
  diagramId: string
  cacheKey: `sha256:${string}`
  outputProfile: DiagramCacheOutputProfile
}

export type DiagramCacheWriteRequest = DiagramCacheReadRequest & {
  svg?: string
  pngDataUrl?: string
}

export type DiagramCacheClearRequest = {
  projectPath: string
  modelName?: string | null
  diagramId?: string
}

export type DiagramCacheReadResult =
  | { ok: true; hit: true; outputProfile: 'review'; svg: string }
  | { ok: true; hit: true; outputProfile: 'thumbnail' | 'export'; pngDataUrl: string }
  | {
      ok: true
      hit: false
      outputProfile: DiagramCacheOutputProfile
      code: 'cache.read-miss'
    }

export type DiagramCacheWriteResult = { ok: true }

export type DiagramCacheClearResult = { ok: true }

export type DiagramCacheErrorCode =
  | 'cache.invalid-diagram-id'
  | 'cache.invalid-cache-key'
  | 'cache.unauthorized-project'
  | 'cache.empty-payload'
  | 'cache.payload-too-large'
  | 'cache.payload-profile-mismatch'
  | 'cache.path-outside-cache'
  | 'cache.write-failed'
  | 'cache.clear-failed'

export type DiagramCacheFailure = {
  ok: false
  code: DiagramCacheErrorCode
  message: string
  details?: unknown
}

export function normalizeDiagramSourceForHash(source: string): string {
  return source.replace(/\r\n?/g, '\n')
}

export function computeDiagramSourceHash(source: string): `sha256:${string}` {
  return `sha256:${sha256Hex(normalizeDiagramSourceForHash(source))}`
}

export function computeDiagramCacheKey(input: DiagramCacheKeyInput): `sha256:${string}` {
  const canonical = JSON.stringify({
    detectedKind: input.detectedKind,
    notation: input.notation,
    outputProfile: input.outputProfile,
    rendererVersion: input.rendererVersion,
    sourceHash: input.sourceHash,
    theme: input.theme
  })
  return `sha256:${sha256Hex(canonical)}`
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

function sha256Hex(input: string): string {
  const bytes = Array.from(new TextEncoder().encode(input))
  const bitLength = BigInt(bytes.length) * 8n
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) {
    bytes.push(0)
  }
  for (let shift = 56n; shift >= 0n; shift -= 8n) {
    bytes.push(Number((bitLength >> shift) & 0xffn))
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]
  const words = Array.from<number>({ length: 64 }).fill(0)

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4
      words[index] =
        ((bytes[start] ?? 0) << 24) |
        ((bytes[start + 1] ?? 0) << 16) |
        ((bytes[start + 2] ?? 0) << 8) |
        (bytes[start + 3] ?? 0)
    }
    for (let index = 16; index < 64; index += 1) {
      words[index] =
        (smallSigma1(words[index - 2] ?? 0) +
          (words[index - 7] ?? 0) +
          smallSigma0(words[index - 15] ?? 0) +
          (words[index - 16] ?? 0)) >>>
        0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const t1 =
        ((h ?? 0) +
          bigSigma1(e ?? 0) +
          choose(e ?? 0, f ?? 0, g ?? 0) +
          SHA256_K[index]! +
          words[index]!) >>>
        0
      const t2 = (bigSigma0(a ?? 0) + majority(a ?? 0, b ?? 0, c ?? 0)) >>> 0
      h = g
      g = f
      f = e
      e = ((d ?? 0) + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }

    hash[0] = ((hash[0] ?? 0) + (a ?? 0)) >>> 0
    hash[1] = ((hash[1] ?? 0) + (b ?? 0)) >>> 0
    hash[2] = ((hash[2] ?? 0) + (c ?? 0)) >>> 0
    hash[3] = ((hash[3] ?? 0) + (d ?? 0)) >>> 0
    hash[4] = ((hash[4] ?? 0) + (e ?? 0)) >>> 0
    hash[5] = ((hash[5] ?? 0) + (f ?? 0)) >>> 0
    hash[6] = ((hash[6] ?? 0) + (g ?? 0)) >>> 0
    hash[7] = ((hash[7] ?? 0) + (h ?? 0)) >>> 0
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

function choose(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z)
}

function majority(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z)
}

function bigSigma0(value: number): number {
  return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22)
}

function bigSigma1(value: number): number {
  return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25)
}

function smallSigma0(value: number): number {
  return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3)
}

function smallSigma1(value: number): number {
  return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10)
}
