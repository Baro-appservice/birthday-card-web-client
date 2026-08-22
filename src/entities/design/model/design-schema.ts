import { z } from 'zod';

import { DESIGN_HEIGHT, DESIGN_VERSION, DESIGN_WIDTH } from './design';
import {
  IMAGE_CROP_FOCUS_MAX,
  IMAGE_CROP_FOCUS_MIN,
  IMAGE_CROP_ZOOM_MAX,
  IMAGE_CROP_ZOOM_MIN,
} from './image-crop-policy';

/*
 * Persisted v1 contract copied from the shipped/main v1 format. Keep every
 * definition in this section unchanged so future migrations always parse v1
 * with the rules that existed when it was written.
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
const assetIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((assetId) => !browserUrlScheme.test(assetId), {
    message: '브라우저 URL은 assetId로 저장할 수 없습니다.',
  });

const v1ImageElementSchema = v1BaseElementSchema
  .extend({
    type: z.literal('image'),
    assetId: assetIdSchema,
  })
  .strict();

const v1ShapeElementSchema = v1BaseElementSchema
  .extend({
    type: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle']),
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
  .strict();

export const designV1Schema = z
  .object({
    version: z.literal(1),
    width: z.literal(DESIGN_WIDTH),
    height: z.literal(DESIGN_HEIGHT),
    pages: z.array(v1DesignPageSchema).min(1),
  })
  .strict();

/* Persisted v2 contract. Keep frozen once v3 exists. */
const v2BaseElementSchema = z
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

const v2TextElementSchema = v2BaseElementSchema
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

const v2ImageElementSchema = v2BaseElementSchema
  .extend({
    type: z.literal('image'),
    assetId: assetIdSchema,
  })
  .strict();

const v2ShapeElementSchema = v2BaseElementSchema
  .extend({
    type: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle', 'ellipse']),
    fill: z.string().min(1),
  })
  .strict();

const v2DesignElementSchema = z.discriminatedUnion('type', [
  v2TextElementSchema,
  v2ImageElementSchema,
  v2ShapeElementSchema,
]);

const v2DesignPageSchema = z
  .object({
    id: z.string().min(1),
    background: z.string().min(1),
    elements: z.array(v2DesignElementSchema),
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

export const designV2Schema = z
  .object({
    version: z.literal(2),
    width: z.literal(DESIGN_WIDTH),
    height: z.literal(DESIGN_HEIGHT),
    pages: z.array(v2DesignPageSchema).min(1),
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

/* Current v3 contract: image crop focus/zoom become explicit persisted state. */
const v3BaseElementSchema = v2BaseElementSchema;

export const textElementSchema = v3BaseElementSchema
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

export const imageElementSchema = v3BaseElementSchema
  .extend({
    type: z.literal('image'),
    assetId: assetIdSchema,
    cropZoom: z.number().min(IMAGE_CROP_ZOOM_MIN).max(IMAGE_CROP_ZOOM_MAX),
    cropFocusX: z.number().min(IMAGE_CROP_FOCUS_MIN).max(IMAGE_CROP_FOCUS_MAX),
    cropFocusY: z.number().min(IMAGE_CROP_FOCUS_MIN).max(IMAGE_CROP_FOCUS_MAX),
  })
  .strict();

export const shapeElementSchema = v3BaseElementSchema
  .extend({
    type: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle', 'ellipse']),
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

export const designV3Schema = z
  .object({
    version: z.literal(3),
    width: z.literal(DESIGN_WIDTH),
    height: z.literal(DESIGN_HEIGHT),
    pages: z.array(designPageSchema).min(1),
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

if (DESIGN_VERSION !== 3) {
  throw new Error('현재 Design version과 designV3Schema가 일치하지 않습니다.');
}

export const designSchema = designV3Schema;
