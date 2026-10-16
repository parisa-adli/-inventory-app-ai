import { Router } from 'express';
import type { ZodTypeAny } from 'zod';
import { PERMISSIONS, catalogListQuerySchema, type Permission } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { createCatalogService } from '../services/catalog.js';

interface CatalogRouterConfig {
  service: ReturnType<typeof createCatalogService<never, unknown>>;
  /** Create and edit (PRD §2: staff and admins). Reads need INVENTORY_VIEW. */
  writePermission: Permission;
  /** Delete (PRD §2: admin only). */
  deletePermission: Permission;
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
}

/** GET (paginated), POST, PATCH /:id and DELETE /:id for a catalog record (categories, suppliers). */
export const catalogRouter = ({
  service,
  writePermission,
  deletePermission,
  createSchema,
  updateSchema,
}: CatalogRouterConfig) => {
  const router = Router();
  const write = can(writePermission);

  router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
    res.json(await service.list(catalogListQuerySchema.parse(req.query)));
  });

  router.post('/', ...write, validate(createSchema), async (req, res) => {
    res.status(201).json(await service.create(req.body));
  });

  router.patch('/:id', ...write, validate(updateSchema), async (req, res) => {
    res.json(await service.update(String(req.params.id), req.body));
  });

  router.delete('/:id', ...can(deletePermission), async (req, res) => {
    await service.remove(String(req.params.id));
    res.status(204).end();
  });

  return router;
};
