import { z } from 'zod'
import { SCRY_VERSION } from './model'

export const scryLayerSchema = z.union([z.literal('plan'), z.literal('committed')])
export const scryKindSchema = z.union([
  z.literal('person'),
  z.literal('system'),
  z.literal('container'),
  z.literal('component'),
  z.literal('symbol')
])

export const sourceLocationSchema = z
  .object({
    pattern: z.string().min(1),
    symbol: z.string().optional(),
    line: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    command: z.string().optional()
  })
  .strict()

export const sourceSchema = z
  .object({
    pattern: z.string().min(1),
    comment: z.string().optional()
  })
  .strict()

export const responsibilitySchema = z
  .object({
    id: z.string().min(1),
    statement: z.string(),
    vagrant: z.boolean().optional(),
    stale: z.boolean().optional(),
    staleProposal: z.string().optional(),
    directives: z.array(z.string()).optional(),
    lastTouchedAt: z.number().optional()
  })
  .strict()

export const propertySchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
    vagrant: z.boolean().optional(),
    stale: z.boolean().optional(),
    lastTouchedAt: z.number().optional()
  })
  .strict()

export const nodeSchema = z
  .object({
    id: z.string().min(1),
    kind: scryKindSchema,
    name: z.string(),
    parentId: z.string().optional(),
    external: z.boolean().optional(),
    technology: z.string().optional(),
    description: z.string().optional(),
    vagrant: z.boolean().optional(),
    stale: z.boolean().optional(),
    responsibilities: z.array(responsibilitySchema).optional(),
    properties: z.array(propertySchema).optional(),
    icon: z.string().optional(),
    visual: z.boolean().optional(),
    appearance: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional()
  })
  .strict()

export const linkSchema = z
  .object({
    id: z.string().min(1),
    src: z.string().min(1),
    dst: z.string().min(1),
    label: z.string(),
    method: z.string().optional()
  })
  .strict()

export const groupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string().optional(),
    memberIds: z.array(z.string()),
    parentGroupId: z.string().optional(),
    parentNodeId: z.string().nullable().optional(),
    responsibilities: z.array(responsibilitySchema).optional(),
    icon: z.string().optional()
  })
  .strict()

export const scryModelSchema = z
  .object({
    version: z.literal(SCRY_VERSION),
    nodes: z.array(nodeSchema),
    links: z.array(linkSchema),
    groups: z.array(groupSchema),
    sourceMap: z.record(z.string(), z.array(sourceLocationSchema)),
    boundaries: z.record(z.string(), z.array(sourceSchema))
  })
  .strict()
