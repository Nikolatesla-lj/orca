import { z } from 'zod'
import type { ScryerOperationId } from './operation-identifiers'
import {
  containerFillInputSchema,
  containerFillSuccessSchema
} from './container-generation-schemas'
import { driftFlagInputSchema, driftFlagSuccessSchema } from './drift-schemas'
import {
  modelQueryInputSchema,
  modelQuerySuccessSchema,
  modelReadInputSchema,
  modelReadSuccessSchema,
  modelSearchInputSchema,
  modelSearchSuccessSchema
} from './model-read-schemas'
import {
  linkAddInputSchema,
  linkAddSuccessSchema,
  linkDeleteInputSchema,
  linkDeleteSuccessSchema,
  nodeDescopeInputSchema,
  nodeDescopeSuccessSchema,
  nodeMoveInputSchema,
  nodeMoveSuccessSchema,
  nodeSetSubtreeInputSchema,
  nodeSetSubtreeSuccessSchema,
  nodeUpdateInputSchema,
  nodeUpdateSuccessSchema,
  planFoldInputSchema,
  planFoldSuccessSchema,
  planPendingInputSchema,
  planPendingSuccessSchema,
  responsibilityMoveInputSchema,
  responsibilityMoveSuccessSchema
} from './plan-authoring-schemas'
import {
  codebaseReadInputSchema,
  codebaseReadSuccessSchema,
  modelHealthInputSchema,
  modelHealthSuccessSchema,
  modelValidateInputSchema,
  modelValidateSuccessSchema,
  rulesReadInputSchema,
  rulesReadSuccessSchema
} from './project-read-schemas'

const stringProjectSchema = z.object({ project: z.string().optional() }).strict()
const countResultSchema = z.record(z.string(), z.unknown())
const emptyInputSchema = z.object({}).strict()

export const operationSchemas: Record<
  ScryerOperationId,
  { input: z.ZodTypeAny; success: z.ZodTypeAny }
> = {
  'scryer.model.read': { input: modelReadInputSchema, success: modelReadSuccessSchema },
  'scryer.model.search': {
    input: modelSearchInputSchema,
    success: modelSearchSuccessSchema
  },
  'scryer.model.query': {
    input: modelQueryInputSchema,
    success: modelQuerySuccessSchema
  },
  'scryer.rules.read': {
    input: rulesReadInputSchema,
    success: rulesReadSuccessSchema
  },
  'scryer.codebase.read': {
    input: codebaseReadInputSchema,
    success: codebaseReadSuccessSchema
  },
  'scryer.model.validate': {
    input: modelValidateInputSchema,
    success: modelValidateSuccessSchema
  },
  'scryer.model.health': {
    input: modelHealthInputSchema,
    success: modelHealthSuccessSchema
  },
  'scryer.plan.pending': {
    input: planPendingInputSchema,
    success: planPendingSuccessSchema
  },
  'scryer.node.update': { input: nodeUpdateInputSchema, success: nodeUpdateSuccessSchema },
  'scryer.link.add': { input: linkAddInputSchema, success: linkAddSuccessSchema },
  'scryer.link.update': {
    input: z
      .object({
        project: z.string().optional(),
        links: z
          .array(
            z
              .object({
                link_id: z.string().min(1),
                label: z.string().optional(),
                method: z.string().optional()
              })
              .strict()
          )
          .min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.link.delete': { input: linkDeleteInputSchema, success: linkDeleteSuccessSchema },
  'scryer.node.set-subtree': {
    input: nodeSetSubtreeInputSchema,
    success: nodeSetSubtreeSuccessSchema
  },
  'scryer.node.delete': {
    input: z
      .object({ project: z.string().optional(), node_ids: z.array(z.string()).min(1) })
      .strict(),
    success: countResultSchema
  },
  'scryer.node.move': {
    input: nodeMoveInputSchema,
    success: nodeMoveSuccessSchema
  },
  'scryer.responsibility.move': {
    input: responsibilityMoveInputSchema,
    success: responsibilityMoveSuccessSchema
  },
  'scryer.group.set': {
    input: z.object({ project: z.string().optional(), data: z.unknown() }).strict(),
    success: countResultSchema
  },
  'scryer.group.update': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.group.delete': {
    input: z.object({ project: z.string().optional(), group_id: z.string() }).strict(),
    success: countResultSchema
  },
  'scryer.person.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.system.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.container.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.component.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.group.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.symbol.add': {
    input: z
      .object({
        project: z.string().optional(),
        items: z.array(z.record(z.string(), z.unknown())).min(1)
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.source.update': {
    input: z
      .object({
        project: z.string().optional(),
        entries: z.array(z.record(z.string(), z.unknown())).optional(),
        schemas: z.array(z.record(z.string(), z.unknown())).optional(),
        boundaries: z.array(z.record(z.string(), z.unknown())).optional()
      })
      .strict(),
    success: countResultSchema
  },
  'scryer.plan.fold': { input: planFoldInputSchema, success: planFoldSuccessSchema },
  'scryer.model.set': {
    input: z.object({ project: z.string().optional(), data: z.unknown() }).strict(),
    success: countResultSchema
  },
  'scryer.container.fill': {
    input: containerFillInputSchema,
    success: containerFillSuccessSchema
  },
  'scryer.node.descope': {
    input: nodeDescopeInputSchema,
    success: nodeDescopeSuccessSchema
  },
  'scryer.drift.get': { input: stringProjectSchema, success: countResultSchema },
  'scryer.drift.flag': { input: driftFlagInputSchema, success: driftFlagSuccessSchema },
  'scryer.drift.reconcile': { input: stringProjectSchema, success: countResultSchema }
}

export const unimplementedSuccessSchema = emptyInputSchema
