# Shared Folder

This folder contains shared code, types, constants, and seed data used by both the client and server.

## Structure

```
/shared
  /constants         - Enums and constant values
  /types            - TypeScript interfaces and types
  /schemas          - Zod validation schemas
  /seed-data        - Database seed data for development and testing
```

## Benefits

1. **Single Source of Truth** - Define validation rules, types, and constants once
2. **Type Safety** - Both client and server stay in sync automatically
3. **No Duplication** - Avoid maintaining separate validation logic
4. **Easier Refactoring** - Change a schema once, both sides update
5. **Consistent Validation** - Same rules on frontend forms and backend API

## Usage

### In Server (Node.js)
```typescript
import { USER_ROLES, ACCOUNT_STATUS } from '../shared/constants';
import { seedUsers, seedProducts } from '../shared/seed-data';
```

### In Client (React)
```typescript
import { USER_ROLES, ACCOUNT_STATUS } from '../../shared/constants';
```

## Constants

- **roles.ts** - User role definitions (admin, staff) with hierarchy
- **account-status.ts** - Account status values (pending, active, rejected)
- **stock-movement-types.ts** - Stock transaction types (receive, ship, adjust)

## Seed Data

All seed data files export arrays of objects ready for database seeding:

- **users.ts** - 7 users including admin, staff, and test accounts for pending/rejected states
- **categories.ts** - 8 product categories covering common inventory types
- **suppliers.ts** - 8 suppliers with complete contact information
- **products.ts** - 32 products across all categories with varied stock levels (in-stock, low-stock, out-of-stock, archived)
- **stock-movements.ts** - 34 historical stock movements demonstrating receives, shipments, and adjustments

### Seed Data Relationships

The seed data uses reference strings that must be resolved during seeding:

- **products** reference categories by `title` and suppliers by `name`
- **stock-movements** reference products by `sku` and users by `email`

### Seeding Order

To maintain referential integrity, seed in this order:

1. Users
2. Categories
3. Suppliers
4. Products (after categories and suppliers exist)
5. Stock Movements (after products and users exist)

### Stock Level Examples

The seed data includes realistic scenarios:

- **In Stock**: Most products with healthy quantities
- **Low Stock**: Webcam HD (8 units), First Aid Kit (3 units), Utility Knife Set (5 units)
- **Out of Stock**: Keyboard Mechanical RGB (0 units)
- **Archived**: Old Model Scanner (demonstrates archived status)
- **No Supplier**: Generic Label Maker (demonstrates optional supplier field)

### Movement History

Stock movements demonstrate:
- Initial stock receives
- Customer shipments
- Inventory adjustments (damage, physical count corrections)
- High-volume items with multiple transactions
- Realistic timestamps spread over the past month

## TypeScript Configuration

Both client and server `tsconfig.json` should include the shared folder in their paths for clean imports.
