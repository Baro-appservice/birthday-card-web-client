import { z } from 'zod';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from './design';

/*
 * Persisted v1 schemas are intentionally isolated from the current-schema
 * aliases below. When v2 is introduced, do not edit these v1 definitions;
 * add a separate v2 schema and migrate v1 -> v2 explicitly.
 */
const v1BaseElementSchema = z
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

const v1TextElementSchema = v1BaseElementSchema
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

const v1ImageElementSchema = v1BaseElementSchema
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

const v1ShapeElementSchema = v1BaseElementSchema
  .extend({
    type: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle', 'ellipse']),
    fill: z.string().min(1),
  })
  .strict();

const v1DesignElementSchema = z.discriminatedUnion('type', [
  v1TextElementSchema,
  v1ImageElementSchema,
  v1ShapeElementSchema,
]);

const v1DesignPageSchema = z
  .object({
    id: z.string().min(1),
    background: z.string().min(1),
    elements: z.array(v1DesignElementSchema),
  })
  .strict()
  .superRefine((page, context) => {
    const seen = new Set<string>();
    page.elements.forEach((element, index) => {
      if (seen.has(element.id)) {
        context.addIssue({
          code: 'custom',
          message: `중복된 요소 ID입니다: ${element.id}`,
          path: ['elements', index, 'id'],
        });
      }
      seen.add(element.id);
    });
  });

/** Frozen persisted v1 contract. */
export const designV1Schema = z
  .object({
    version: z.literal(1),
    width: z.literal(DESIGN_WIDTH),
    height: z.literal(DESIGN_HEIGHT),
    pages: z.array(v1DesignPageSchema).min(1),
  })
  .strict()
  .superRefine((design, context) => {
    const seen = new Set<string>();
    design.pages.forEach((page, index) => {
      if (seen.has(page.id)) {
        context.addIssue({
          code: 'custom',
          message: `중복된 페이지 ID입니다: ${page.id}`,
          path: ['pages', index, 'id'],
        });
      }
      seen.add(page.id);
    });
  });

/*
 * Current canonical aliases. They point at v1 only while DESIGN_VERSION is 1.
 * A future v2 change should replace these aliases with v2 schemas while leaving
 * every v1 schema above untouched.
 */
export const textElementSchema = v1TextElementSchema;
export const imageElementSchema = v1ImageElementSchema;
export const shapeElementSchema = v1ShapeElementSchema;
export const designElementSchema = v1DesignElementSchema;
export const designPageSchema = v1DesignPageSchema;
export const designSchema = designV1Schema;
