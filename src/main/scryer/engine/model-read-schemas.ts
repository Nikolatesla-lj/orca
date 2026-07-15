import { z } from 'zod'
import { SCRY_VERSION } from './model'
import {
  linkSchema,
  nodeSchema,
  scryKindSchema,
  scryLayerSchema,
  scryModelSchema,
  sourceLocationSchema,
  sourceSchema
} from './model-schemas'

export const modelReadInputSchema = z
  .object({
    project: z.string().optional(),
    view: z.union([z.literal('overview'), z.literal('subtree'), z.literal('full')]).optional(),
    node: z.string().optional(),
    layer: scryLayerSchema.optional()
  })
  .strict()

export const recommendedReadSchema = z
  .object({
    operationId: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    reason: z.string()
  })
  .strict()

const readNodeSummarySchema = z
  .object({
    id: z.string(),
    kind: scryKindSchema,
    name: z.string(),
    path: z.string(),
    depth: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
    nResp: z.number().int().nonnegative(),
    nProps: z.number().int().nonnegative(),
    parentId: z.string().optional(),
    description: z.string().optional(),
    technology: z.string().optional(),
    external: z.boolean().optional(),
    stale: z.boolean().optional(),
    vagrant: z.boolean().optional()
  })
  .strict()

const overviewNodeSchema = readNodeSummarySchema
  .extend({
    directSymbolCount: z.number().int().nonnegative(),
    responsibilityCount: z.number().int().nonnegative(),
    propertyCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    hasSourceAnchors: z.boolean(),
    hasBoundaries: z.boolean(),
    hasExternalLinks: z.boolean(),
    hiddenSymbolDescendants: z.boolean(),
    hasChildren: z.boolean()
  })
  .omit({ nResp: true, nProps: true })
  .strict()

const modelReadOverviewSuccessSchema = z
  .object({
    view: z.literal('overview'),
    layer: scryLayerSchema,
    version: z.literal(SCRY_VERSION),
    nodeCount: z.number().int().nonnegative(),
    linkCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    overview: z.array(overviewNodeSchema),
    recommendedNextReads: z.array(recommendedReadSchema),
    baselineRefreshed: z.boolean().optional()
  })
  .strict()

const modelReadSubtreeSuccessSchema = z
  .object({
    view: z.literal('subtree'),
    layer: scryLayerSchema,
    version: z.literal(SCRY_VERSION),
    nodeCount: z.number().int().nonnegative(),
    linkCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    node: readNodeSummarySchema,
    descendants: z.array(nodeSchema),
    internalLinks: z.array(linkSchema),
    externalLinks: z.array(linkSchema),
    contextNodes: z.array(readNodeSummarySchema),
    referencesForChildren: z.array(
      z
        .object({
          id: z.string(),
          kind: scryKindSchema,
          name: z.string(),
          path: z.string(),
          direction: z.union([z.literal('incoming'), z.literal('outgoing')]),
          label: z.string()
        })
        .strict()
    ),
    sourceMap: z.record(z.string(), z.array(sourceLocationSchema)),
    boundaries: z.record(z.string(), z.array(sourceSchema)),
    degraded: z.boolean(),
    truncated: z.boolean(),
    approximateSizeBytes: z.number().int().nonnegative().optional(),
    children: z.array(readNodeSummarySchema).optional(),
    recommendedNextReads: z.array(recommendedReadSchema),
    baselineRefreshed: z.boolean().optional()
  })
  .strict()

const modelReadFullSuccessSchema = z
  .object({
    view: z.literal('full'),
    layer: scryLayerSchema,
    version: z.literal(SCRY_VERSION),
    nodeCount: z.number().int().nonnegative(),
    linkCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    model: scryModelSchema,
    baselineRefreshed: z.boolean().optional()
  })
  .strict()

export const modelReadSuccessSchema = z.discriminatedUnion('view', [
  modelReadOverviewSuccessSchema,
  modelReadSubtreeSuccessSchema,
  modelReadFullSuccessSchema
])

export const modelSearchInputSchema = z
  .object({
    project: z.string().optional(),
    query: z.string().trim().min(1),
    kind: scryKindSchema.optional(),
    layer: scryLayerSchema.optional()
  })
  .strict()

const searchMatchSchema = z
  .object({
    field: z.string(),
    value: z.string(),
    match: z.union([z.literal('exact'), z.literal('fuzzy')]),
    score: z.number()
  })
  .strict()

const searchHitSchema = z
  .object({
    id: z.string(),
    kind: scryKindSchema,
    name: z.string(),
    path: z.string(),
    score: z.number(),
    matched: z.array(searchMatchSchema),
    parentId: z.string().optional()
  })
  .strict()

export const modelSearchSuccessSchema = z
  .object({
    layer: scryLayerSchema,
    query: z.string(),
    kind: scryKindSchema.optional(),
    resultCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    hits: z.array(searchHitSchema)
  })
  .strict()

const queryOperatorSchema = z.union([
  z.literal('eq'),
  z.literal('ne'),
  z.literal('contains'),
  z.literal('gt'),
  z.literal('gte'),
  z.literal('lt'),
  z.literal('lte'),
  z.literal('exists'),
  z.literal('absent')
])

const rawQueryConditionSchema = z
  .object({
    field: z.string().min(1),
    op: queryOperatorSchema.optional(),
    operator: queryOperatorSchema.optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.op && !value.operator) {
      ctx.addIssue({ code: 'custom', path: ['op'], message: 'Required query operator' })
    }
    if (value.op && value.operator && value.op !== value.operator) {
      ctx.addIssue({
        code: 'custom',
        path: ['operator'],
        message: 'Conflicting query operator aliases'
      })
    }
  })
  .transform(({ field, op, operator, value }) => ({
    field,
    op: op ?? operator!,
    ...(value !== undefined ? { value } : {})
  }))

export const modelQueryInputSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value
    }
    const record = value as Record<string, unknown>
    if (record.where === undefined && record.conditions !== undefined) {
      return { ...record, where: record.conditions }
    }
    if (record.where !== undefined && record.conditions !== undefined) {
      return { ...record, __whereConflict: true }
    }
    return record
  },
  z
    .object({
      project: z.string().optional(),
      where: z.array(rawQueryConditionSchema).min(1),
      conditions: z.undefined().optional(),
      __whereConflict: z.undefined().optional(),
      under: z.string().optional(),
      layer: scryLayerSchema.optional()
    })
    .strict()
    .transform(({ project, where, under, layer }) => ({
      ...(project ? { project } : {}),
      where,
      ...(under ? { under } : {}),
      ...(layer ? { layer } : {})
    }))
)

const queryHitSchema = z
  .object({
    id: z.string(),
    kind: scryKindSchema,
    name: z.string(),
    path: z.string(),
    nResp: z.number().int().nonnegative(),
    nProps: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
    parentId: z.string().optional(),
    external: z.boolean().optional(),
    visual: z.boolean().optional(),
    empty: z.boolean().optional(),
    vagrant: z.boolean().optional()
  })
  .strict()

export const modelQuerySuccessSchema = z
  .object({
    layer: scryLayerSchema,
    resultCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    hits: z.array(queryHitSchema),
    where: z.array(
      z
        .object({
          field: z.string(),
          op: queryOperatorSchema,
          value: z.union([z.string(), z.number(), z.boolean()]).optional()
        })
        .strict()
    ),
    under: z.string().optional()
  })
  .strict()
