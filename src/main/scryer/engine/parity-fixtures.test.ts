import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertParityEnvelopeShape, loadParityFixture, scrubParityValue } from './parity-fixtures'

async function writeCase(fixture: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-scryer-parity-'))
  const casePath = join(dir, 'case.json')
  await writeFile(casePath, JSON.stringify(fixture, null, 2))
  return casePath
}

describe('Scryer parity fixtures', () => {
  it('loads only zod-validated parity metadata', async () => {
    const casePath = await writeCase({
      operationId: 'scryer.link.add',
      provenance: 'upstream_parity',
      upstreamCommit: '0123456789abcdef0123456789abcdef01234567',
      upstreamAnchors: ['links.rs::add_links', 'validate.rs::link_violation'],
      input: { links: [{ src: 'web', dst: 'api', label: 'calls' }] },
      context: {},
      expected: 'success',
      orcaDifferenceReason: 'structured envelope replaces MCP Content::text output'
    })

    await expect(loadParityFixture(casePath)).resolves.toMatchObject({
      operationId: 'scryer.link.add',
      provenance: 'upstream_parity',
      expected: 'success'
    })
  })

  it('rejects a placeholder revision masquerading as upstream parity', async () => {
    const casePath = await writeCase({
      operationId: 'scryer.model.set',
      provenance: 'upstream_parity',
      upstreamCommit: '0000000',
      upstreamAnchors: ['nodes.rs::set_model'],
      input: {},
      context: {},
      expected: 'success',
      orcaDifferenceReason: 'structured envelope replaces MCP text'
    })

    await expect(loadParityFixture(casePath)).rejects.toThrow(/upstream_parity requires a real/)
  })

  it('requires local_regression fixtures to document the Orca-only expected state', async () => {
    const casePath = await writeCase({
      operationId: 'scryer.model.set',
      provenance: 'local_regression',
      upstreamAnchors: ['nodes.rs::set_model'],
      input: {},
      context: {},
      expected: 'success',
      orcaDifferenceReason: 'structured envelope replaces MCP text'
    })

    await expect(loadParityFixture(casePath)).rejects.toThrow(/local_regression requires/)
  })

  it('accepts a local_regression fixture with a placeholder-free provenance record', async () => {
    const casePath = await writeCase({
      operationId: 'scryer.model.set',
      provenance: 'local_regression',
      upstreamAnchors: ['nodes.rs::set_model'],
      input: {},
      context: {},
      expected: 'success',
      orcaDifferenceReason: 'structured envelope replaces MCP text',
      localRegressionReason:
        'Orca engine produces the committed/planned state; upstream cannot be reproduced here'
    })

    await expect(loadParityFixture(casePath)).resolves.toMatchObject({
      provenance: 'local_regression'
    })
  })

  it('requires fixture expectation to match the operation envelope', () => {
    expect(() =>
      assertParityEnvelopeShape(
        {
          operationId: 'scryer.link.add',
          provenance: 'upstream_parity',
          upstreamCommit: '0123456789abcdef0123456789abcdef01234567',
          upstreamAnchors: ['links.rs::add_links'],
          input: {},
          context: {},
          expected: 'success',
          orcaDifferenceReason: 'structured envelope replaces MCP text'
        },
        {
          ok: false,
          operationId: 'scryer.link.add',
          requestId: 'req-1',
          error: { code: 'internal_error', message: 'bad' }
        }
      )
    ).toThrow('expected ok:true')
  })

  it('scrubs request ids, timestamps, temp paths, and absolute paths for golden comparison', () => {
    expect(
      scrubParityValue({
        requestId: 'req-abc',
        createdAt: '2026-06-24T12:00:00.000Z',
        tempPath: '/tmp/orca/file',
        path: '/home/example/project/.scryer/model.scry'
      })
    ).toEqual({
      requestId: '<requestId>',
      createdAt: '<timestamp>',
      tempPath: '<tmp-path>',
      path: '<abs-path>'
    })
  })
})
