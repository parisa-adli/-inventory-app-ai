# Verification Checklist

Use this checklist after seeding each phase to ensure data integrity and proper relationships.

## Phase 00: Project Setup

### Infrastructure
- [ ] `/server/src/seed.js` file exists
- [ ] `package.json` has `"seed": "node src/seed.js"` script
- [ ] File includes MongoDB connection logic
- [ ] File has `runSeed()` function skeleton
- [ ] Script can connect to MongoDB successfully

## Phase 01: Identity & Auth

### Database Verification
- [ ] All users from seed data are created in MongoDB
- [ ] Passwords are hashed (not plain text in database)
- [ ] Admin user exists with `role: 'admin'`, `status: 'active'`, `emailVerified: true`
- [ ] Staff users exist with `role: 'staff'`, `status: 'active'`, `emailVerified: true`
- [ ] Manager users are converted to `role: 'staff'`
- [ ] Pending user exists with `status: 'pending'`, `emailVerified: true`
- [ ] Rejected user exists with `status: 'rejected'`
- [ ] No `EmailToken`, `OtpCode`, or `RefreshToken` documents seeded

### Functional Verification
```bash
# Run seed
cd server
npm run seed

# Verify in MongoDB shell
use inventory_db
db.users.find().pretty()
db.users.countDocuments({ role: 'admin' })  # Should be 1
db.users.countDocuments({ role: 'staff' })  # Should be 4 (2 original staff + 2 converted managers)
db.users.countDocuments({ status: 'active' })  # Should be 4
```

### Application Testing
- [ ] Can log in as admin using `admin@inventory.local` / `Admin@123`
- [ ] Can log in as staff using `john.staff@inventory.local` / `Staff@123`
- [ ] Pending user can log in but sees "awaiting approval" screen
- [ ] Rejected user sees rejection message

## Phase 02: Categories & Suppliers

### Database Verification
- [ ] All 8 categories from seed data exist
- [ ] All 8 suppliers from seed data exist
- [ ] Each category has: `title`, `description`, `createdAt`
- [ ] Each supplier has: `name`, `contactPerson`, `phone`, `email`, `address`, `notes`, `createdAt`

### Functional Verification
```bash
# Verify in MongoDB shell
db.categories.countDocuments()  # Should be 8
db.suppliers.countDocuments()  # Should be 8

# Check specific records
db.categories.findOne({ title: 'Electronics' })
db.suppliers.findOne({ name: 'TechSupply Co.' })
```

### Application Testing
- [ ] Categories page shows all 8 categories in card grid
- [ ] Suppliers page shows all 8 suppliers in card grid
- [ ] Staff user can view but not create/edit/delete
- [ ] Admin user can view and has create/edit/delete buttons

## Phase 03: Products & Stock Movements

### Database Verification - Products
- [ ] All 32 products from seed data exist
- [ ] Each product has a valid `category` ObjectId reference
- [ ] Products with suppliers have valid `supplier` ObjectId references
- [ ] Products without suppliers have `supplier: null`
- [ ] All SKUs are unique
- [ ] Product quantities match seed data

```bash
# Verify in MongoDB shell
db.products.countDocuments()  # Should be 32
db.products.countDocuments({ supplier: null })  # Check unassigned products
db.products.countDocuments({ status: 'active' })
db.products.countDocuments({ status: 'archived' })

# Check reference resolution
db.products.findOne({ sku: 'ELEC-WM-001' })
# Verify category and supplier are ObjectIds, not strings
```

### Database Verification - Stock Movements
- [ ] All stock movements from seed data exist
- [ ] Each movement has a valid `product` ObjectId reference
- [ ] Each movement has a valid `user` ObjectId reference
- [ ] Movement types are correct: 'receive', 'ship', or 'adjustment'
- [ ] `resultingQuantity` is populated for all movements
- [ ] Movement dates span historical range (60-90 days)

```bash
# Verify in MongoDB shell
db.stockmovements.countDocuments()  # Should be 34+
db.stockmovements.countDocuments({ type: 'receive' })
db.stockmovements.countDocuments({ type: 'ship' })
db.stockmovements.countDocuments({ type: 'adjustment' })

# Check reference resolution
db.stockmovements.findOne()
# Verify product and user are ObjectIds, not strings
```

### Critical Validation: Quantity Consistency
For each product, verify the last movement's `resultingQuantity` matches the product's current `quantity`:

```javascript
// Run this validation script
const products = await Product.find({});
for (const product of products) {
  const lastMovement = await StockMovement
    .findOne({ product: product._id })
    .sort({ createdAt: -1 });
  
  if (lastMovement && lastMovement.resultingQuantity !== product.quantity) {
    console.error(
      `MISMATCH ${product.sku}: Product=${product.quantity}, LastMovement=${lastMovement.resultingQuantity}`
    );
  }
}
```

- [ ] All product quantities match their last movement's `resultingQuantity`
- [ ] No products with quantity > 0 have zero movements
- [ ] All movements are attributed to valid users (admin or staff)

### Application Testing
- [ ] Products page displays all products with correct categories/suppliers
- [ ] "Unassigned" filter shows products with no supplier
- [ ] Stock status filters work (In Stock/Low Stock/Out of Stock)
- [ ] Inline +/- buttons work and create new movements
- [ ] Stock History modal shows correct movement history for each product
- [ ] Adjust Stock modal works for all 3 types (receive/ship/adjustment)
- [ ] Cannot ship more than available quantity
- [ ] Manual adjustments require a reason/note

## Phase 04: Stock Movements Page

### Application Testing
- [ ] Stock Movements page displays all seeded movements
- [ ] Date column shows correct timestamps
- [ ] Product column shows product title/SKU
- [ ] Type column shows correct badges (receive/ship/adjustment)
- [ ] Quantity and Resulting Quantity columns are accurate
- [ ] Note/Reason column shows data for adjustments
- [ ] User column shows correct user names
- [ ] Product filter works
- [ ] Type filter works (receive/ship/adjustment)
- [ ] Date range filter works
- [ ] Pagination works if >10-20 movements
- [ ] New movements created elsewhere appear immediately

## Phase 05: Dashboard

### Application Testing
- [ ] **Total Products** card shows correct count (active products only)
- [ ] **Total Stock Value** card shows Σ(costPrice × quantity) for active products
- [ ] **Total Stock Income** card shows Σ(salePrice × quantity) for active products
- [ ] **Low Stock** card shows count of products at/below threshold
- [ ] **Out of Stock** card shows count of products with quantity = 0
- [ ] Recent Stock Movements feed shows last ~10 movements
- [ ] Low/Out-of-Stock alert table shows correct products
- [ ] Chart displays receive vs ship data over time
- [ ] Chart range selector works (7/30/90 days)
- [ ] Chart data matches movement history
- [ ] Dashboard updates after creating new movements

### Manual Spot Check
Calculate manually for 2-3 products:
```
Product: Wireless Mouse
- costPrice: $12.50
- salePrice: $24.99
- quantity: 150
- Stock Value contribution: $1,875
- Stock Income contribution: $3,748.50
```

- [ ] Manual calculations match dashboard card values

## Phase 06: Polish & QA

### Seed Script Quality
- [ ] Seed script runs without errors or warnings
- [ ] Script provides clear console output showing progress
- [ ] Script completes in reasonable time (<30 seconds)
- [ ] Can run seed script multiple times (idempotent - clears before insert)
- [ ] Error messages are helpful if references are missing

### Data Quality
- [ ] Data tells a realistic warehouse operations story
- [ ] Product mix spans multiple categories and suppliers
- [ ] Stock levels are varied (high/medium/low/zero)
- [ ] Movement history shows realistic patterns (receives before ships)
- [ ] Movement notes/reasons are meaningful
- [ ] Dates are well-distributed (not all on same day)
- [ ] At least one manual adjustment with detailed reason exists

### Documentation
- [ ] README includes seed script instructions
- [ ] Environment variables documented
- [ ] Seed data credentials documented for testing
- [ ] Known test accounts listed (admin, staff, pending, rejected)

### Edge Cases
- [ ] At least one product with 0 quantity exists
- [ ] At least one product without supplier exists
- [ ] At least one archived product exists
- [ ] At least one pending user (verified) exists for admin approval testing
- [ ] At least one rejected user exists for access denial testing
- [ ] At least one unverified pending user exists to test activation blocker

## Common Issues & Solutions

### Issue: "Category not found" error during product seeding
**Solution:** Verify categories were seeded first and Map key matches exactly (case-sensitive)

### Issue: Product quantity doesn't match last movement
**Solution:** Check seed data in `products.ts` and `stock-movements.ts` - the last movement's `resultingQuantity` must equal product's `quantity`

### Issue: References are strings, not ObjectIds in database
**Solution:** Reference resolution failed - check Map building and lookup logic in seed script

### Issue: All managers are missing after seeding
**Solution:** Working as intended - managers are converted to staff per PRD requirements

### Issue: Seed script fails to connect to MongoDB
**Solution:** Check `MONGODB_URI` environment variable is set correctly

### Issue: Password hash validation fails in application
**Solution:** Verify bcrypt rounds match between seed script (10) and auth service

## Quick Validation Command

Run this after each phase to verify basic integrity:

```bash
# MongoDB shell quick check
mongosh inventory_db --eval "
  print('Users:', db.users.countDocuments());
  print('Categories:', db.categories.countDocuments());
  print('Suppliers:', db.suppliers.countDocuments());
  print('Products:', db.products.countDocuments());
  print('Movements:', db.stockmovements.countDocuments());
  print('Admin users:', db.users.countDocuments({ role: 'admin' }));
  print('Active users:', db.users.countDocuments({ status: 'active' }));
"
```

Expected output after Phase 03:
```
Users: 6
Categories: 8
Suppliers: 8
Products: 32
Movements: 34+
Admin users: 1
Active users: 4
```
