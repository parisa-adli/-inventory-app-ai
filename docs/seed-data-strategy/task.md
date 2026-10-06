# Seed Data Implementation Plan

## Context

The user wants to create and seed database data for each model **alongside implementation** in each development phase, rather than seeding all data at the end. The codebase already has comprehensive seed data files in `/shared/seed-data/` that are ready to use, but the server infrastructure and Mongoose models haven't been created yet.

This approach ensures that:
- Each feature can be tested with realistic data immediately after implementation
- Dependencies between models are respected (users before products, categories before products, etc.)
- The final phase (06-polish-qa) only needs to verify and potentially enhance the seed script, not create it from scratch

## Critical Files

**Existing seed data (ready to use):**
- `/shared/seed-data/users.ts` - 7 users (1 admin, 3 active staff, 2 pending [1 verified, 1 unverified], 1 rejected)
- `/shared/seed-data/categories.ts` - 8 categories
- `/shared/seed-data/suppliers.ts` - 8 suppliers  
- `/shared/seed-data/products.ts` - 32 products across all categories
- `/shared/seed-data/stock-movements.ts` - 34+ stock movements with historical dates
- `/shared/seed-data/index.ts` - Exports all seed data

**Existing constants:**
- `/shared/constants/roles.ts` - USER_ROLES (admin, manager, staff)
- `/shared/constants/account-status.ts` - ACCOUNT_STATUS (pending, approved, rejected)
- `/shared/constants/stock-movement-types.ts` - STOCK_MOVEMENT_TYPES

**To be created:**
- `/server/src/seed.js` - Main seeding script (created incrementally per phase)
- `/server/src/models/*.js` - Mongoose models (created per phase)
- `/server/package.json` - Need seed script command

## Role Handling Resolution

**PRD specifies:** `admin` and `staff` roles only (no `manager`)  
**Seed data has:** `admin`, `manager`, and `staff` roles

**Resolution:** Treat all `manager` role users in seed data as `staff` during seeding. The seed script will map `USER_ROLES.MANAGER` → `'staff'` when creating User documents.

## Phase-by-Phase Implementation

### Phase 00: Project Setup
**Models:** None  
**Seeding:** Create the initial `/server/src/seed.js` structure with database connection and a `runSeed()` function skeleton. Add npm script `"seed": "node src/seed.js"` to server package.json.

**Why:** Establishes the seeding infrastructure before any models exist.

### Phase 01: Identity & Auth
**Models:** `User`, `EmailToken`, `OtpCode`, `RefreshToken`

**Seeding approach:**
1. Create the `User` model matching PRD §4 schema
2. Update `seed.js` to:
   - Import bcrypt for password hashing
   - Import seed data from `../../shared/seed-data/users`
   - Create a `seedUsers()` function that:
     - Clears existing User documents
     - Hashes passwords (plain text in seed data is for reference only)
     - Inserts users with proper role/status/emailVerified values
     - Returns the created users (store in a Map by email for later reference resolution)
3. Do NOT seed `EmailToken`, `OtpCode`, or `RefreshToken` - these are transient, runtime-generated records

**Seed data to insert:**
- 1 admin user (status: active, emailVerified: true)
- 2-3 staff users (status: active, emailVerified: true) - needed for stock movement attribution
- 1 pending user (emailVerified: true, awaiting approval)
- 1 rejected user (for testing blocked access)

**Verification:**
- Run `npm run seed` successfully
- Verify users exist in MongoDB with hashed passwords
- Login should work with the plain passwords from seed data

### Phase 02: Categories & Suppliers
**Models:** `Category`, `Supplier`

**Seeding approach:**
1. Create `Category` and `Supplier` models per PRD §4
2. Update `seed.js` to:
   - Import seed data from `../../shared/seed-data/categories` and `../../shared/seed-data/suppliers`
   - Create `seedCategories()` function:
     - Clear existing Category documents
     - Insert all categories from seed data
     - Return created categories (store in a Map by title for product reference resolution)
   - Create `seedSuppliers()` function:
     - Clear existing Supplier documents
     - Insert all suppliers from seed data
     - Return created suppliers (store in a Map by name for product reference resolution)
3. Update main `runSeed()` to call in order: `seedUsers()`, `seedCategories()`, `seedSuppliers()`

**Seed data to insert:**
- All 8 categories from seed data
- All 8 suppliers from seed data

**Verification:**
- Run `npm run seed` successfully
- Categories and suppliers visible in UI with correct counts
- Admin can view/edit all categories and suppliers

### Phase 03: Products & Initial Stock Movements
**Models:** `Product`, `StockMovement`

**Seeding approach:**
1. Create `Product` and `StockMovement` models per PRD §4
2. Update `seed.js` to:
   - Import seed data from `../../shared/seed-data/products` and `../../shared/seed-data/stock-movements`
   - Create `seedProducts()` function:
     - Clear existing Product documents
     - Resolve references:
       - `categoryRef` (string title) → Category._id lookup
       - `supplierRef` (string name) → Supplier._id lookup (nullable)
     - Insert products with resolved ObjectId references
     - Return created products (store in a Map by SKU for stock movement resolution)
   - Create `seedStockMovements()` function:
     - Clear existing StockMovement documents
     - Resolve references:
       - `productRef` (string SKU) → Product._id lookup
       - `userRef` (string email) → User._id lookup
     - Insert movements with resolved ObjectId references
     - **Critical validation:** Verify that the final `resultingQuantity` in each product's movement history matches the `product.quantity` value in seed data
3. Update main `runSeed()` to call in order: users → categories → suppliers → products → stock movements

**Seed data to insert:**
- All 32 products from seed data (varied stock levels, some without suppliers)
- All 34+ stock movements from seed data (receives, ships, adjustments)

**Why this matters:** Stock movements are the source of truth. Every product with quantity > 0 must have a movement history that explains how it got there.

**Verification:**
- Run `npm run seed` successfully
- Products appear with correct quantities
- Stock history modal for each product shows matching movements
- Dashboard cards show realistic values
- Inline +/- buttons create new movements

### Phase 04: Stock Movements Page
**Models:** None (uses existing `StockMovement`)

**Seeding:** No new seeding needed - movements already seeded in phase 03

**Verification:**
- Stock movements page displays all seeded movements
- Filters work (product, type, date range)
- All movements show correct user attribution

### Phase 05: Dashboard
**Models:** None (aggregates existing data)

**Seeding:** No new seeding needed - data already exists

**Optional enhancement:** Could add more historical movements (60-90 days back) if chart visualization needs more data points

**Verification:**
- Dashboard cards calculate correct totals from seeded data
- Chart shows receive vs ship over time with meaningful distribution
- Low/out-of-stock alerts match products in seed data
- Recent movements feed shows latest activities

### Phase 06: Polish & QA
**Seeding:** Final audit and enhancement

**Tasks:**
1. Verify the seed script runs cleanly with no warnings
2. Ensure data tells a realistic "story" of warehouse operations
3. Add npm script documentation to README
4. Consider adding:
   - More stock movements spanning 90 days for better chart visualization
   - Edge cases (product with 0 quantity but movement history, manual adjustments with detailed reasons)
   - An unverified pending user to test the admin activation blocker

**Verification:**
- Fresh database → run seed → entire app is usable with realistic data
- All UI filters, sorts, and aggregations produce meaningful results
- Dashboard is visually interesting (not empty or too sparse)

## Reference Resolution Strategy

The seed data uses string references that must be resolved to MongoDB ObjectIds during seeding:

```javascript
// Example pattern for reference resolution
const userMap = new Map(); // email → User doc
const categoryMap = new Map(); // title → Category doc
const supplierMap = new Map(); // name → Supplier doc
const productMap = new Map(); // SKU → Product doc

// When seeding products:
for (const productData of seedProducts) {
  const category = categoryMap.get(productData.categoryRef);
  const supplier = productData.supplierRef 
    ? supplierMap.get(productData.supplierRef) 
    : null;
  
  const product = await Product.create({
    ...productData,
    category: category._id,
    supplier: supplier?._id || null,
  });
  
  productMap.set(product.sku, product);
}
```

## Key Mongoose Seeding Patterns

**Clear before insert:**
```javascript
await User.deleteMany({});
await Category.deleteMany({});
// etc.
```

**Password hashing:**
```javascript
const bcrypt = require('bcryptjs');
const passwordHash = await bcrypt.hash(userData.password, 10);
```

**Handle nullable references:**
```javascript
supplier: productData.supplierRef 
  ? supplierMap.get(productData.supplierRef)?._id 
  : null
```

**Maintain referential integrity:**
Seed in order: Users → Categories/Suppliers → Products → StockMovements

## Testing the Seed Script

After each phase implementation:
1. Drop the database: `db.dropDatabase()` in MongoDB shell
2. Run: `npm run seed` (from `/server` directory)
3. Verify: Check MongoDB that documents exist with correct relationships
4. Verify: Start the app and confirm data appears correctly in UI

## Out of Scope

- Seeding transient auth tokens (`EmailToken`, `OtpCode`, `RefreshToken`) - these are created at runtime
- Production seeding - this is dev/test data only
- Data migrations - this is initial seed only, not ongoing data management
