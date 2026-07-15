import { z } from 'zod'
import { recommendedReadSchema } from './model-read-schemas'
import { validationFindingSchema } from './operation-error-schemas'

const proposedResponsibilitySchema = z.union([
  z.string(),
  z
    .object({
      statement: z.string().min(1),
      line: z.number().int().nonnegative().optional(),
      endLine: z.number().int().nonnegative().optional()
    })
    .strict()
])

const proposedPropertySchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional()
  })
  .strict()

const proposedSymbolSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    source_file: z.string().min(1),
    line: z.number().int().nonnegative().optional(),
    end_line: z.number().int().nonnegative().optional(),
    responsibilities: z.array(proposedResponsibilitySchema).optional(),
    properties: z.array(proposedPropertySchema).optional(),
    visual: z.boolean().optional()
  })
  .strict()

const proposedComponentSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    responsibilities: z.array(z.string()).optional(),
    symbols: z.array(proposedSymbolSchema).min(1)
  })
  .strict()

const proposedLinkSchema = z
  .object({
    src: z.string().min(1),
    dst: z.string().min(1),
    label: z.string(),
    method: z.string().optional()
  })
  .strict()

const proposedGroupSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    member_keys: z.array(z.string().min(1)).min(2),
    responsibilities: z.array(z.string()).optional()
  })
  .strict()

export const containerFillInputSchema = z
  .object({
    project: z.string().optional(),
    container_id: z.string().min(1),
    components: z.array(proposedComponentSchema).min(1),
    links: z.array(proposedLinkSchema).optional(),
    groups: z.array(proposedGroupSchema).optional()
  })
  .strict()

const droppedLinkSchema = z
  .object({
    src: z.string(),
    dst: z.string(),
    label: z.string(),
    method: z.string().optional(),
    reason: z.string()
  })
  .strict()

const edgeGraphStatusSchema = z.union([
  z.literal('available'),
  z.literal('missing'),
  z.literal('empty'),
  z.literal('stale'),
  z.literal('partially_unresolved')
])

export const containerFillSuccessSchema = z
  .object({
    commit: z
      .object({
        committedWritten: z.boolean(),
        plannedMirrored: z.boolean(),
        baselineRefreshed: z.literal(false)
      })
      .strict(),
    summary: z
      .object({
        containerId: z.string(),
        components: z.number().int().nonnegative(),
        symbols: z.number().int().nonnegative(),
        groups: z.number().int().nonnegative(),
        derivedLinks: z.number().int().nonnegative(),
        keptLinks: z.number().int().nonnegative(),
        droppedLinks: z.number().int().nonnegative(),
        sourceAnchors: z.number().int().nonnegative()
      })
      .strict(),
    created: z
      .object({
        components: z.array(
          z
            .object({
              id: z.string(),
              key: z.string(),
              name: z.string(),
              responsibilityIds: z.array(z.string()),
              symbolIds: z.array(z.string())
            })
            .strict()
        ),
        symbols: z.array(
          z
            .object({
              id: z.string(),
              key: z.string(),
              name: z.string(),
              parentComponentId: z.string(),
              responsibilityIds: z.array(z.string()),
              propertyLabels: z.array(z.string()),
              sourceKeys: z.array(z.string())
            })
            .strict()
        ),
        groups: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              memberIds: z.array(z.string()),
              responsibilityIds: z.array(z.string())
            })
            .strict()
        )
      })
      .strict(),
    reports: z
      .object({
        droppedLinks: z.array(droppedLinkSchema),
        edgeGraphStatus: edgeGraphStatusSchema,
        thinSymbolCount: z.number().int().nonnegative(),
        findings: z.array(validationFindingSchema)
      })
      .strict(),
    recommendedNextReads: z.array(recommendedReadSchema)
  })
  .strict()
