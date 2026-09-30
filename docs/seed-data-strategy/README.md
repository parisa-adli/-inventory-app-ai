# Seed Data Strategy

This folder contains the comprehensive strategy for seeding database data throughout the development lifecycle of the Product Inventory Manager application.

## Overview

Instead of seeding all data at the end of development, this strategy implements **incremental seeding** alongside each feature phase. This ensures:

- Each feature can be tested with realistic data immediately after implementation
- Dependencies between models are properly respected
- The final polish phase only needs verification, not creation from scratch

## Documents

- **task.md** - Main implementation plan with phase-by-phase seeding instructions
- **reference-resolution-guide.md** - Detailed patterns for resolving string references to MongoDB ObjectIds
- **verification-checklist.md** - Testing checklist for each phase

## Quick Reference

### Seeding Order
1. **Phase 00**: Infrastructure setup (seed.js skeleton)
2. **Phase 01**: Users (with password hashing)
3. **Phase 02**: Categories + Suppliers
4. **Phase 03**: Products + Stock Movements (with reference resolution)
5. **Phase 04-05**: No new seeding (use existing data)
6. **Phase 06**: Final audit and enhancements

### Key Command
```bash
cd server
npm run seed
```

### Existing Seed Data Location
All seed data is ready to use in `/shared/seed-data/`:
- `users.ts` - 6 users
- `categories.ts` - 8 categories
- `suppliers.ts` - 8 suppliers
- `products.ts` - 32 products
- `stock-movements.ts` - 34+ movements

## Important Notes

- **Manager role handling**: Manager users in seed data will be converted to `staff` role to match PRD requirements
- **Stock movements are source of truth**: Every product quantity change must have a corresponding StockMovement record
- **Reference resolution required**: Seed data uses string references (email, SKU, title, name) that must be resolved to ObjectIds during seeding
- **No transient token seeding**: EmailToken, OtpCode, and RefreshToken are runtime-generated only

## Created
2026-09-30
