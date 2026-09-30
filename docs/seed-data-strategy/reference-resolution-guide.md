# Reference Resolution Guide

## Overview

The seed data in `/shared/seed-data/` uses human-readable string references instead of MongoDB ObjectIds. During seeding, these must be resolved to actual database references.

## Reference Types

### 1. User References
**Used in:** StockMovement documents  
**Reference field:** `userRef`  
**Lookup by:** `email` (string)  
**Resolves to:** `User._id` (ObjectId)

```javascript
// Seed data format
{
  userRef: 'admin@inventory.local',
  // ... other fields
}

// Resolution pattern
const userMap = new Map(); // email → User document

// During user seeding
for (const userData of seedUsers) {
  const user = await User.create({...});
  userMap.set(user.email, user);
}

// During stock movement seeding
const user = userMap.get(movementData.userRef);
const movement = await StockMovement.create({
  ...movementData,
  user: user._id,
});
```

### 2. Category References
**Used in:** Product documents  
**Reference field:** `categoryRef`  
**Lookup by:** `title` (string)  
**Resolves to:** `Category._id` (ObjectId)

```javascript
// Seed data format
{
  title: 'Wireless Mouse',
  categoryRef: 'Electronics',
  // ... other fields
}

// Resolution pattern
const categoryMap = new Map(); // title → Category document

// During category seeding
for (const categoryData of seedCategories) {
  const category = await Category.create({...});
  categoryMap.set(category.title, category);
}

// During product seeding
const category = categoryMap.get(productData.categoryRef);
const product = await Product.create({
  ...productData,
  category: category._id,
});
```

### 3. Supplier References
**Used in:** Product documents  
**Reference field:** `supplierRef`  
**Lookup by:** `name` (string)  
**Resolves to:** `Supplier._id` (ObjectId) or `null`

```javascript
// Seed data format
{
  title: 'Wireless Mouse',
  supplierRef: 'TechSupply Co.', // Can be null/undefined
  // ... other fields
}

// Resolution pattern
const supplierMap = new Map(); // name → Supplier document

// During supplier seeding
for (const supplierData of seedSuppliers) {
  const supplier = await Supplier.create({...});
  supplierMap.set(supplier.name, supplier);
}

// During product seeding
const supplier = productData.supplierRef 
  ? supplierMap.get(productData.supplierRef) 
  : null;

const product = await Product.create({
  ...productData,
  supplier: supplier?._id || null,
});
```

### 4. Product References
**Used in:** StockMovement documents  
**Reference field:** `productRef`  
**Lookup by:** `sku` (string)  
**Resolves to:** `Product._id` (ObjectId)

```javascript
// Seed data format
{
  productRef: 'ELEC-WM-001',
  type: 'receive',
  // ... other fields
}

// Resolution pattern
const productMap = new Map(); // SKU → Product document

// During product seeding
for (const productData of seedProducts) {
  const product = await Product.create({...});
  productMap.set(product.sku, product);
}

// During stock movement seeding
const product = productMap.get(movementData.productRef);
const movement = await StockMovement.create({
  ...movementData,
  product: product._id,
});
```

## Complete Seeding Flow

```javascript
async function runSeed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Phase 1: Seed users (no dependencies)
    const userMap = await seedUsers();
    console.log(`✓ Seeded ${userMap.size} users`);

    // Phase 2: Seed categories and suppliers (no dependencies)
    const categoryMap = await seedCategories();
    const supplierMap = await seedSuppliers();
    console.log(`✓ Seeded ${categoryMap.size} categories`);
    console.log(`✓ Seeded ${supplierMap.size} suppliers`);

    // Phase 3: Seed products (depends on categories, suppliers)
    const productMap = await seedProducts(categoryMap, supplierMap);
    console.log(`✓ Seeded ${productMap.size} products`);

    // Phase 4: Seed stock movements (depends on products, users)
    await seedStockMovements(productMap, userMap);
    console.log(`✓ Seeded stock movements`);

    console.log('✓ Seeding completed successfully');
  } catch (error) {
    console.error('✗ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}
```

## Error Handling

### Missing Reference
```javascript
const category = categoryMap.get(productData.categoryRef);
if (!category) {
  throw new Error(
    `Category not found: ${productData.categoryRef} (referenced by product: ${productData.title})`
  );
}
```

### Null/Undefined References (Supplier is optional)
```javascript
// Don't throw error if supplier is not provided
const supplier = productData.supplierRef 
  ? supplierMap.get(productData.supplierRef)
  : null;

// But throw if supplierRef is provided but not found
if (productData.supplierRef && !supplier) {
  throw new Error(
    `Supplier not found: ${productData.supplierRef} (referenced by product: ${productData.title})`
  );
}
```

## Map Building Pattern

Each seeding function should return a Map for downstream resolution:

```javascript
async function seedUsers() {
  const userMap = new Map();
  
  await User.deleteMany({}); // Clear existing
  
  for (const userData of seedUsers) {
    // Convert manager role to staff per PRD requirements
    const role = userData.role === USER_ROLES.MANAGER 
      ? 'staff' 
      : userData.role;
    
    const passwordHash = await bcrypt.hash(userData.password, 10);
    
    const user = await User.create({
      name: userData.name,
      email: userData.email,
      passwordHash,
      role,
      status: userData.status,
      emailVerified: userData.emailVerified,
      telegramChatId: userData.telegramChatId,
    });
    
    userMap.set(user.email, user); // Key by email for lookup
  }
  
  return userMap;
}
```

## Validation After Seeding

### Verify Product Quantities Match Movement History
```javascript
async function validateStockQuantities() {
  const products = await Product.find({});
  
  for (const product of products) {
    const movements = await StockMovement
      .find({ product: product._id })
      .sort({ createdAt: 1 });
    
    if (movements.length > 0) {
      const lastMovement = movements[movements.length - 1];
      
      if (lastMovement.resultingQuantity !== product.quantity) {
        console.warn(
          `⚠ Quantity mismatch for ${product.sku}: ` +
          `Product has ${product.quantity}, ` +
          `last movement resulted in ${lastMovement.resultingQuantity}`
        );
      }
    } else if (product.quantity > 0) {
      console.warn(
        `⚠ Product ${product.sku} has quantity ${product.quantity} ` +
        `but no stock movement history`
      );
    }
  }
}
```

## Common Pitfalls

1. **Case sensitivity**: Reference lookups are case-sensitive. Ensure seed data uses consistent casing.

2. **Whitespace**: Trim whitespace from reference strings to avoid failed lookups.

3. **Order matters**: Always seed in dependency order: Users → Categories/Suppliers → Products → Movements

4. **Map keys**: Use the correct field as the Map key (email for users, title for categories, name for suppliers, SKU for products)

5. **Null handling**: Supplier is optional on products - handle null/undefined gracefully

6. **Role mapping**: Remember to map manager → staff during user seeding per PRD requirements
