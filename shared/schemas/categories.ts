import { z } from 'zod';
import { catalogListQuerySchema, formField, optionalText, requiredText } from './catalog';

export const CATEGORY_TITLE_MAX = 80;
export const CATEGORY_DESCRIPTION_MAX = 500;

const title = requiredText('Title', CATEGORY_TITLE_MAX);
const description = optionalText('Description', CATEGORY_DESCRIPTION_MAX);

/** Body of POST /api/categories. Empty optional fields are left out. */
export const createCategorySchema = z.object({
  title,
  description: description.optional(),
});

/** Body of PATCH /api/categories/:id: absent = unchanged, `null` = clear. The title cannot be cleared. */
export const updateCategorySchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Send at least one field to change',
  });

/** The create/edit dialog. Empty inputs are allowed; the client maps them before sending. */
export const categoryFormSchema = z.object({
  title,
  description: formField(description),
});

export const listCategoriesQuerySchema = catalogListQuerySchema;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
