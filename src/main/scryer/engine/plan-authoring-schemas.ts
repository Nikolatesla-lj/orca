import { z } from 'zod'
import {
  linkSchema,
  nodeSchema,
  propertySchema,
  responsibilitySchema,
  scryKindSchema
} from './model-schemas'
import { recommendedReadSchema } from './model-read-schemas'
import { validationFindingSchema } from './operation-error-schemas'

export const updateNodeItemSchema = z
  .object({
    node_id: z.string().min(1),
    kind: scryKindSchema.optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    technology: z.string().optional(),
    external: z.boolean().optional(),
    responsibilities: z.array(responsibilitySchema).optional(),
    properties: z.array(propertySchema).optional(),
    visual: z.boolean().optional(),
    appearance: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional(),
    parent_id: z.string().nullable().optional()
  })
  .strict()

export const nodeUpdateInputSchema = z
  .object({
    project: z.string().optional(),
    nodes: z.array(updateNodeItemSchema).min(1)
  })
  .strict()

export const pendingSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byChange: z.record(z.string(), z.number().int().nonnegative()),
    toImplement: z.number().int().nonnegative().optional(),
    toReimplement: z.number().int().nonnegative().optional(),
    toMove: z.number().int().nonnegative().optional(),
    toDelete: z.number().int().nonnegative().optional(),
    toRepoint: z.number().int().nonnegative().optional()
  })
  .strict()

export const nodeUpdateSuccessSchema = z
  .object({
    updatedCount: z.number().int().nonnegative(),
    findings: z.array(validationFindingSchema).optional(),
    pendingSummary: pendingSummarySchema.optional()
  })
  .strict()

export const linkAddInputSchema = z
  .object({
    project: z.string().optional(),
    links: z
      .array(
        z
          .object({
            src: z.string().min(1),
            dst: z.string().min(1),
            label: z.string(),
            method: z.string().optional()
          })
          .strict()
      )
      .min(1)
  })
  .strict()

export const linkAddSuccessSchema = z
  .object({
    addedIds: z.array(z.string()),
    findings: z.array(validationFindingSchema).optional(),
    pendingSummary: pendingSummarySchema.optional()
  })
  .strict()

export const linkDeleteInputSchema = z
  .object({
    project: z.string().optional(),
    link_ids: z.array(z.string().min(1)).min(1)
  })
  .strict()

export const linkDeleteSuccessSchema = z
  .object({
    deletedCount: z.number().int().nonnegative(),
    missingIds: z.array(z.string()).optional(),
    pendingSummary: pendingSummarySchema.optional()
  })
  .strict()

export const setSubtreeDataSchema = z
  .object({
    nodes: z.array(nodeSchema),
    links: z.array(linkSchema).optional()
  })
  .strict()

export const nodeSetSubtreeInputSchema = z
  .object({
    project: z.string().optional(),
    node_id: z.string().min(1),
    data: setSubtreeDataSchema
  })
  .strict()

const groupCleanupSummarySchema = z
  .object({
    removedGroupCount: z.number().int().nonnegative(),
    updatedGroupCount: z.number().int().nonnegative(),
    removedMembershipCount: z.number().int().nonnegative()
  })
  .strict()

export const nodeSetSubtreeSuccessSchema = z
  .object({
    rootId: z.string(),
    addedNodeCount: z.number().int().nonnegative(),
    removedNodeCount: z.number().int().nonnegative(),
    addedLinkCount: z.number().int().nonnegative(),
    removedLinkCount: z.number().int().nonnegative(),
    groupCleanup: groupCleanupSummarySchema,
    findings: z.array(validationFindingSchema),
    pendingSummary: pendingSummarySchema,
    recommendedNextReads: z.array(recommendedReadSchema)
  })
  .strict()

export const nodeMoveInputSchema = z
  .object({
    project: z.string().optional(),
    moves: z
      .array(
        z
          .object({
            node_id: z.string().min(1),
            new_parent_id: z.string().min(1).nullable().optional()
          })
          .strict()
      )
      .min(1)
  })
  .strict()

export const nodeMoveSuccessSchema = z
  .object({
    moved: z.array(
      z
        .object({
          nodeId: z.string(),
          fromParentId: z.string().optional(),
          toParentId: z.string().optional()
        })
        .strict()
    ),
    groupCleanup: groupCleanupSummarySchema,
    findings: z.array(validationFindingSchema),
    pendingSummary: pendingSummarySchema,
    recommendedNextReads: z.array(recommendedReadSchema)
  })
  .strict()

export const responsibilityMoveInputSchema = z
  .object({
    project: z.string().optional(),
    moves: z
      .array(
        z
          .object({
            responsibility_id: z.string().min(1),
            from_node_id: z.string().min(1),
            to_node_id: z.string().min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict()

export const responsibilityMoveSuccessSchema = z
  .object({
    moved: z.array(
      z
        .object({
          responsibilityId: z.string(),
          fromNodeId: z.string(),
          toNodeId: z.string()
        })
        .strict()
    ),
    findings: z.array(validationFindingSchema),
    pendingSummary: pendingSummarySchema,
    recommendedNextReads: z.array(recommendedReadSchema)
  })
  .strict()

export const nodeDescopeInputSchema = z
  .object({
    project: z.string().optional(),
    node_ids: z.array(z.string().min(1)).min(1)
  })
  .strict()

export const nodeDescopeSuccessSchema = z
  .object({
    descopedCount: z.number().int().nonnegative(),
    relocatedResponsibilityCount: z.number().int().nonnegative(),
    droppedResponsibilityCount: z.number().int().nonnegative(),
    removedLinkCount: z.number().int().nonnegative(),
    groupCleanup: groupCleanupSummarySchema,
    modelCorrection: z.literal(true),
    codeAction: z.literal('code_unchanged'),
    pendingReason: z.literal('model_correction_code_unchanged'),
    findings: z.array(validationFindingSchema),
    pendingSummary: pendingSummarySchema,
    recommendedNextReads: z.array(recommendedReadSchema)
  })
  .strict()

export const planPendingInputSchema = z
  .object({
    project: z.string().optional()
  })
  .strict()

export const pendingChangeSchema = z
  .object({
    kind: z.union([
      z.literal('node'),
      z.literal('link'),
      z.literal('responsibility'),
      z.literal('property'),
      z.literal('group')
    ]),
    id: z.string(),
    ownerId: z.string().optional(),
    label: z.string(),
    changes: z.array(z.record(z.string(), z.unknown()))
  })
  .passthrough()

export const planPendingSuccessSchema = z
  .object({
    clean: z.boolean(),
    changes: z.array(pendingChangeSchema),
    summary: pendingSummarySchema
  })
  .strict()

export const planFoldInputSchema = z
  .object({
    project: z.string().optional(),
    mode: z.union([z.literal('manual'), z.literal('agent_completion')]).default('manual'),
    node_id: z.string().optional(),
    responsibility_ids: z.array(z.string()).optional(),
    property_labels: z.array(z.string()).optional(),
    properties: z.array(z.object({ node_id: z.string(), label: z.string() }).strict()).optional(),
    link_ids: z.array(z.string()).optional(),
    group_ids: z.array(z.string()).optional(),
    include_descendants: z.boolean().optional(),
    all: z.boolean().optional()
  })
  .strict()

export const foldedItemSchema = z
  .object({
    kind: z.union([
      z.literal('node'),
      z.literal('link'),
      z.literal('responsibility'),
      z.literal('property'),
      z.literal('group')
    ]),
    id: z.string(),
    ownerId: z.string().optional(),
    change: z.string().optional()
  })
  .strict()

export const planFoldSuccessSchema = z
  .object({
    folded: z.array(foldedItemSchema),
    remaining: z.array(pendingChangeSchema),
    findings: z.array(validationFindingSchema).optional()
  })
  .strict()
