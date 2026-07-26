import { z } from 'zod'
import { scryKindSchema } from './model-schemas'

function aliasObject(value: unknown, aliases: Record<string, string>): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }
  const record = { ...(value as Record<string, unknown>) }
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (record[alias] !== undefined && record[canonical] === undefined) {
      record[canonical] = record[alias]
    }
    delete record[alias]
  }
  return record
}

const nonEmptyTrimmedString = z.string().trim().min(1)

const sourcedVerdictShape = {
  source_file: nonEmptyTrimmedString.optional(),
  symbol: nonEmptyTrimmedString.optional(),
  line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
  reason: z.string().optional()
}

const driftTargetSchema = z
  .object({
    node_id: nonEmptyTrimmedString.optional(),
    node_key: nonEmptyTrimmedString.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.node_id) === Boolean(value.node_key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['node_id'],
        message: 'Set exactly one of node_id or node_key'
      })
    }
  })

const driftNewNodeSchema = z.preprocess(
  (value) => aliasObject(value, { parentId: 'parent_id', parentKey: 'parent_key' }),
  z
    .object({
      key: nonEmptyTrimmedString,
      kind: scryKindSchema,
      name: nonEmptyTrimmedString,
      parent_id: nonEmptyTrimmedString.optional(),
      parent_key: nonEmptyTrimmedString.optional(),
      description: z.string().optional(),
      technology: z.string().optional()
    })
    .strict()
    .superRefine((value, ctx) => {
      if (Boolean(value.parent_id) === Boolean(value.parent_key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['parent_id'],
          message: 'Set exactly one of parent_id or parent_key'
        })
      }
    })
)

const driftUndescribedSchema = z.preprocess(
  (value) =>
    aliasObject(value, {
      nodeId: 'node_id',
      nodeKey: 'node_key',
      sourceFile: 'source_file',
      endLine: 'end_line'
    }),
  driftTargetSchema
    .extend({
      statement: nonEmptyTrimmedString,
      ...sourcedVerdictShape
    })
    .strict()
)

const driftUndescribedPropertySchema = z.preprocess(
  (value) =>
    aliasObject(value, {
      nodeId: 'node_id',
      nodeKey: 'node_key',
      sourceFile: 'source_file',
      endLine: 'end_line'
    }),
  driftTargetSchema
    .extend({
      label: nonEmptyTrimmedString,
      description: z.string().optional(),
      ...sourcedVerdictShape
    })
    .strict()
)

const driftStaleResponsibilitySchema = z.preprocess(
  (value) =>
    aliasObject(value, {
      responsibilityId: 'responsibility_id',
      proposed_statement: 'proposedStatement'
    }),
  z
    .object({
      responsibility_id: nonEmptyTrimmedString,
      proposedStatement: z.string().optional(),
      reason: z.string().optional()
    })
    .strict()
)

const driftStalePropertySchema = z.preprocess(
  (value) => aliasObject(value, { nodeId: 'node_id' }),
  z
    .object({
      node_id: nonEmptyTrimmedString,
      label: nonEmptyTrimmedString,
      reason: z.string().optional()
    })
    .strict()
)

const driftStaleNodeSchema = z.preprocess(
  (value) => aliasObject(value, { nodeId: 'node_id' }),
  z
    .object({
      node_id: nonEmptyTrimmedString,
      reason: z.string().optional()
    })
    .strict()
)

export const driftFlagInputSchema = z
  .object({
    project: z.string().optional(),
    node_id: nonEmptyTrimmedString,
    undescribed: z.array(driftUndescribedSchema).optional(),
    new_nodes: z.array(driftNewNodeSchema).optional(),
    undescribed_properties: z.array(driftUndescribedPropertySchema).optional(),
    stale: z.array(driftStaleResponsibilitySchema).optional(),
    stale_properties: z.array(driftStalePropertySchema).optional(),
    stale_nodes: z.array(driftStaleNodeSchema).optional()
  })
  .strict()

export const driftFlagSuccessSchema = z
  .object({
    flagged: z.number().int().nonnegative(),
    mintedNodes: z.record(z.string(), z.string()),
    vagrantResponsibilities: z.array(
      z
        .object({
          nodeId: z.string(),
          responsibilityId: z.string(),
          statement: z.string()
        })
        .strict()
    ),
    vagrantProperties: z.array(
      z
        .object({
          nodeId: z.string(),
          label: z.string()
        })
        .strict()
    ),
    staleResponsibilities: z.array(
      z
        .object({
          responsibilityId: z.string(),
          staleProposal: z.string().optional()
        })
        .strict()
    ),
    staleProperties: z.array(
      z
        .object({
          nodeId: z.string(),
          label: z.string()
        })
        .strict()
    ),
    staleNodes: z.array(
      z
        .object({
          nodeId: z.string()
        })
        .strict()
    ),
    skippedExistingProperties: z
      .array(
        z
          .object({
            nodeId: z.string(),
            label: z.string()
          })
          .strict()
      )
      .optional()
  })
  .strict()
