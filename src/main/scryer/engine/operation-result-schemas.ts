import { z } from 'zod'

export const recommendedReadSchema = z
  .object({
    operationId: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    reason: z.string()
  })
  .strict()
