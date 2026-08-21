import { z } from 'zod';

import { DESIGN_HEIGHT, DESIGN_VERSION, DESIGN_WIDTH } from './design';

const baseElementSchema = z
  .object({
    id: z.string().min(1),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
  })
  .strict();

export const textElementSchema = baseElementSchema
  .extend({
    type: z.literal('text'),
    text: z.string(),
    fontFamily: z.string().min(1),
    fontSize: z.number().positive(),
    fontWeight: z.number().positive(),
    color: z.string().min(1),
    textAlign: z.enum(['left', 'center', 'right']),
  })
  .strict();

const browserUrlScheme = /^(blob|data|https?):/i;

export const imageElementSchema = baseElementSchema
  .extend({
    type: z.literal('image'),
    assetId: z
      .string()
      .trim()
      .min(1)
      .refine((assetId) => !browserUrlScheme.test(assetId), {
        message: '브라우저 URL은 assetId로 저장할 수 없습니다.',
      }),
  })
  .strict();

export const shapeElementSchema = baseElementSchema
  .extend({
    type: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle']),
    fill: z.string().min(1),
  })
  .strict();

export const designElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
]);

export const designPageSchema = z
  .object({
    id: z.string().min(1),
    background: z.string().min(1),
    elements: z.array(designElementSchema),
  })
  .strict();

export const designSchema = z
  .object({
    version: z.literal(DESIGN_VERSION),
    width: z.literal(DESIGN_WIDTH),
    height: z.literal(DESIGN_HEIGHT),
    pages: z.array(designPageSchema).min(1),
  })
  .strict();
