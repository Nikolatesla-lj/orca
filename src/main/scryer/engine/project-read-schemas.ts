import { z } from 'zod'
import { scryLayerSchema } from './model-schemas'
import { validationFindingSchema } from './operation-error-schemas'

const ruleIndexEntrySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    tags: z.array(z.string())
  })
  .strict()

const ruleDetailSchema = ruleIndexEntrySchema
  .extend({
    body: z.string()
  })
  .strict()

export const rulesReadInputSchema = z
  .object({
    topic: z.string().optional()
  })
  .strict()

export const rulesReadSuccessSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('index'),
      rules: z.array(ruleIndexEntrySchema)
    })
    .strict(),
  z
    .object({
      mode: z.literal('topic'),
      topic: z.string(),
      rules: z.array(ruleDetailSchema)
    })
    .strict(),
  z
    .object({
      mode: z.literal('miss'),
      topic: z.string(),
      guidance: z.literal('choose_topic_from_index'),
      rules: z.array(ruleIndexEntrySchema)
    })
    .strict()
])

const codebaseEntrySchema = z
  .object({
    path: z.string(),
    name: z.string(),
    kind: z.union([z.literal('file'), z.literal('directory')]),
    depth: z.number().int().nonnegative(),
    markers: z.array(
      z.union([z.literal('manifest'), z.literal('infrastructure'), z.literal('environment')])
    )
  })
  .strict()

export const codebaseReadInputSchema = z
  .object({
    project: z.string().optional(),
    path: z.string().optional(),
    maxDepth: z.number().int().min(0).max(12).optional(),
    maxEntries: z.number().int().min(1).max(1000).optional()
  })
  .strict()

export const codebaseReadSuccessSchema = z
  .object({
    root: z.string(),
    entries: z.array(codebaseEntrySchema),
    summary: z
      .object({
        fileCount: z.number().int().nonnegative(),
        directoryCount: z.number().int().nonnegative(),
        manifestCount: z.number().int().nonnegative(),
        infrastructureCount: z.number().int().nonnegative(),
        environmentCount: z.number().int().nonnegative(),
        skippedCount: z.number().int().nonnegative()
      })
      .strict(),
    truncated: z.boolean()
  })
  .strict()

export const modelValidateInputSchema = z
  .object({
    project: z.string().optional(),
    layer: scryLayerSchema.optional()
  })
  .strict()

export const modelValidateSuccessSchema = z
  .object({
    findings: z.array(validationFindingSchema),
    validationWarningCount: z.number().int().nonnegative(),
    validationErrorCount: z.number().int().nonnegative()
  })
  .strict()

export const modelHealthInputSchema = z
  .object({
    project: z.string().optional(),
    node_id: z.string().min(1).optional()
  })
  .strict()

const healthCountsSchema = z
  .object({
    responsibilities: z.number().int().nonnegative(),
    properties: z.number().int().nonnegative(),
    vagrant: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
    anchorable: z.number().int().nonnegative(),
    anchored: z.number().int().nonnegative(),
    unmapped: z.number().int().nonnegative(),
    lastTouchedAt: z.number().int().nonnegative().optional()
  })
  .strict()

const boundaryCoverageSchema = z
  .object({
    totalFiles: z.number().int().nonnegative(),
    anchoredFiles: z.number().int().nonnegative(),
    darkFiles: z.array(z.string())
  })
  .strict()

const nodeHealthSchema = z
  .object({
    own: healthCountsSchema,
    subtree: healthCountsSchema,
    boundary: boundaryCoverageSchema.optional()
  })
  .strict()

export const modelHealthSuccessSchema = z
  .object({
    nodes: z.record(z.string(), nodeHealthSchema),
    totals: healthCountsSchema
  })
  .strict()
