import type { UnitOfMeasure } from '../constants';

/**
 * Seed products (#38): about 60 across 6 of the 8 seeded categories. Furniture and Raw Materials are left
 * empty so deleting a category can be demonstrated.
 *
 * No quantity is stored: every product starts at 0 and its stock comes from the generated ledger in
 * ./stock-movements.ts, which ends on `targetQuantity`. `categoryRef` (title) and `supplierRef` (name, or null
 * for "Unassigned") are resolved to ids during seeding.
 *
 * Edge cases: 8 without a supplier, 3 never stocked (0 and no movements), 3 sold out (0 after a history),
 * 9 low (1–9), 4 at exactly the low-stock threshold (10), 1 just above it (11), every unit, 13 without an
 * image, and 2 archived after their ledger is written.
 */
export interface SeedProduct {
  sku: string;
  title: string;
  categoryRef: string;
  supplierRef: string | null;
  costPrice: number;
  salePrice: number;
  unitOfMeasure: UnitOfMeasure;
  imageUrl: string | null;
  /** Where the generated ledger ends; the seed never writes it as a quantity. */
  targetQuantity: number;
  /** A brand-new product: no opening balance, no movements, quantity 0. */
  neverStocked?: boolean;
  /** Archived once its ledger is written. */
  archived?: boolean;
}

/** A stable placeholder photo per SKU. */
const photo = (sku: string) => `https://picsum.photos/seed/${sku.toLowerCase()}/200`;

type CategoryProduct = Omit<SeedProduct, 'categoryRef' | 'imageUrl'> & { image?: false };

const inCategory = (categoryRef: string, products: CategoryProduct[]): SeedProduct[] =>
  products.map(({ image, ...product }) => ({
    ...product,
    categoryRef,
    imageUrl: image === false ? null : photo(product.sku),
  }));

const TECH = 'TechSupply Co.';
const OFFICE = 'Office Depot Wholesale';
const TOOLS = 'Global Tools Distribution';
const PACK = 'PackRight Solutions';
const CLEAN = 'CleanPro Supplies';
const SAFETY = 'SafetyFirst Equipment';
const RAW = 'RawMaterials Direct';

export const seedProducts: SeedProduct[] = [
  ...inCategory('Electronics', [
    { sku: 'ELE-001', title: 'Wireless Mouse', supplierRef: TECH, costPrice: 12.5, salePrice: 24.99, unitOfMeasure: 'pcs', targetQuantity: 142 },
    { sku: 'ELE-002', title: 'USB-C Cable 2m', supplierRef: TECH, costPrice: 5, salePrice: 12.99, unitOfMeasure: 'pcs', targetQuantity: 286 },
    { sku: 'ELE-003', title: 'Laptop Stand', supplierRef: TECH, costPrice: 25, salePrice: 49.99, unitOfMeasure: 'pcs', targetQuantity: 45 },
    { sku: 'ELE-004', title: 'Webcam HD 1080p', supplierRef: TECH, costPrice: 35, salePrice: 69.99, unitOfMeasure: 'pcs', targetQuantity: 3 },
    { sku: 'ELE-005', title: 'Mechanical Keyboard RGB', supplierRef: TECH, costPrice: 45, salePrice: 89.99, unitOfMeasure: 'pcs', targetQuantity: 0 },
    { sku: 'ELE-006', title: 'HDMI Cable', supplierRef: TECH, costPrice: 1.2, salePrice: 2.5, unitOfMeasure: 'm', targetQuantity: 380, image: false },
    { sku: 'ELE-007', title: 'AA Batteries 24-Pack', supplierRef: TECH, costPrice: 9.5, salePrice: 17.99, unitOfMeasure: 'box', targetQuantity: 64 },
    { sku: 'ELE-008', title: 'Generic Label Maker', supplierRef: null, costPrice: 30, salePrice: 59.99, unitOfMeasure: 'pcs', targetQuantity: 10 },
    { sku: 'ELE-009', title: 'Flatbed Scanner (old model)', supplierRef: TECH, costPrice: 80, salePrice: 150, unitOfMeasure: 'pcs', targetQuantity: 2, archived: true, image: false },
    { sku: 'ELE-010', title: 'Wireless Presenter', supplierRef: TECH, costPrice: 18, salePrice: 34.99, unitOfMeasure: 'pcs', targetQuantity: 0, neverStocked: true },
  ]),
  ...inCategory('Office Supplies', [
    { sku: 'OFF-001', title: 'A4 Paper Ream', supplierRef: OFFICE, costPrice: 3.5, salePrice: 7.99, unitOfMeasure: 'pcs', targetQuantity: 512 },
    { sku: 'OFF-002', title: 'Ballpoint Pens Box', supplierRef: OFFICE, costPrice: 8, salePrice: 15.99, unitOfMeasure: 'box', targetQuantity: 118 },
    { sku: 'OFF-003', title: 'Heavy Duty Stapler', supplierRef: OFFICE, costPrice: 12, salePrice: 22.99, unitOfMeasure: 'pcs', targetQuantity: 35 },
    { sku: 'OFF-004', title: 'Filing Folders Pack', supplierRef: OFFICE, costPrice: 6, salePrice: 12.99, unitOfMeasure: 'box', targetQuantity: 196 },
    { sku: 'OFF-005', title: 'Sticky Notes 12-Pack', supplierRef: OFFICE, costPrice: 4.2, salePrice: 8.49, unitOfMeasure: 'box', targetQuantity: 88, image: false },
    { sku: 'OFF-006', title: 'Whiteboard Markers Set', supplierRef: OFFICE, costPrice: 7.5, salePrice: 14.99, unitOfMeasure: 'box', targetQuantity: 7 },
    { sku: 'OFF-007', title: 'Desk Organizer Tray', supplierRef: null, costPrice: 9, salePrice: 17.5, unitOfMeasure: 'pcs', targetQuantity: 23, image: false },
    { sku: 'OFF-008', title: 'Thermal Fax Paper Roll', supplierRef: OFFICE, costPrice: 2.8, salePrice: 5.99, unitOfMeasure: 'pcs', targetQuantity: 0, archived: true },
    { sku: 'OFF-009', title: 'Binder Clips Assorted', supplierRef: null, costPrice: 3.1, salePrice: 6.49, unitOfMeasure: 'box', targetQuantity: 10 },
    { sku: 'OFF-010', title: 'Laminating Pouches A4', supplierRef: OFFICE, costPrice: 11, salePrice: 21.99, unitOfMeasure: 'box', targetQuantity: 0, neverStocked: true, image: false },
  ]),
  ...inCategory('Tools & Equipment', [
    { sku: 'TLS-001', title: 'Cordless Drill Kit', supplierRef: TOOLS, costPrice: 75, salePrice: 149.99, unitOfMeasure: 'pcs', targetQuantity: 25 },
    { sku: 'TLS-002', title: 'Socket Wrench Set', supplierRef: TOOLS, costPrice: 45, salePrice: 89.99, unitOfMeasure: 'pcs', targetQuantity: 30 },
    { sku: 'TLS-003', title: 'Measuring Tape 10m', supplierRef: TOOLS, costPrice: 8, salePrice: 16.99, unitOfMeasure: 'pcs', targetQuantity: 80 },
    { sku: 'TLS-004', title: 'Utility Knife Set', supplierRef: TOOLS, costPrice: 15, salePrice: 29.99, unitOfMeasure: 'pcs', targetQuantity: 5 },
    { sku: 'TLS-005', title: 'Extension Cord', supplierRef: TOOLS, costPrice: 0.9, salePrice: 1.99, unitOfMeasure: 'm', targetQuantity: 240, image: false },
    { sku: 'TLS-006', title: 'Assorted Wood Screws', supplierRef: TOOLS, costPrice: 6.5, salePrice: 12.99, unitOfMeasure: 'kg', targetQuantity: 48 },
    { sku: 'TLS-007', title: 'Claw Hammer 16oz', supplierRef: null, costPrice: 11, salePrice: 21.99, unitOfMeasure: 'pcs', targetQuantity: 19 },
    { sku: 'TLS-008', title: 'Angle Grinder 115mm', supplierRef: TOOLS, costPrice: 55, salePrice: 99.99, unitOfMeasure: 'pcs', targetQuantity: 6 },
    { sku: 'TLS-009', title: 'Spirit Level 60cm', supplierRef: TOOLS, costPrice: 13, salePrice: 24.99, unitOfMeasure: 'pcs', targetQuantity: 11, image: false },
    { sku: 'TLS-010', title: 'Steel Rods 2m', supplierRef: RAW, costPrice: 25, salePrice: 49.99, unitOfMeasure: 'pcs', targetQuantity: 96 },
  ]),
  ...inCategory('Packaging Materials', [
    { sku: 'PKG-001', title: 'Cardboard Boxes Large', supplierRef: PACK, costPrice: 1.5, salePrice: 3.99, unitOfMeasure: 'pcs', targetQuantity: 1040 },
    { sku: 'PKG-002', title: 'Bubble Wrap', supplierRef: PACK, costPrice: 0.6, salePrice: 1.29, unitOfMeasure: 'm', targetQuantity: 450 },
    { sku: 'PKG-003', title: 'Packing Tape 6-Pack', supplierRef: PACK, costPrice: 8, salePrice: 16.99, unitOfMeasure: 'box', targetQuantity: 150 },
    { sku: 'PKG-004', title: 'Stretch Film Roll', supplierRef: PACK, costPrice: 18, salePrice: 35.99, unitOfMeasure: 'pcs', targetQuantity: 40, image: false },
    { sku: 'PKG-005', title: 'Shipping Labels 500', supplierRef: PACK, costPrice: 14, salePrice: 27.99, unitOfMeasure: 'box', targetQuantity: 10 },
    { sku: 'PKG-006', title: 'Packing Peanuts', supplierRef: PACK, costPrice: 2.4, salePrice: 4.99, unitOfMeasure: 'kg', targetQuantity: 75 },
    { sku: 'PKG-007', title: 'Pallet Wrap Dispenser', supplierRef: PACK, costPrice: 32, salePrice: 59.99, unitOfMeasure: 'pcs', targetQuantity: 2 },
    { sku: 'PKG-008', title: 'Kraft Paper Roll', supplierRef: RAW, costPrice: 0.4, salePrice: 0.89, unitOfMeasure: 'm', targetQuantity: 620, image: false },
    { sku: 'PKG-009', title: 'Padded Envelopes A4', supplierRef: null, costPrice: 5.5, salePrice: 10.99, unitOfMeasure: 'box', targetQuantity: 37 },
    { sku: 'PKG-010', title: 'Corner Protectors', supplierRef: PACK, costPrice: 0.3, salePrice: 0.75, unitOfMeasure: 'pcs', targetQuantity: 860 },
  ]),
  ...inCategory('Cleaning Supplies', [
    { sku: 'CLN-001', title: 'Multi-Surface Cleaner', supplierRef: CLEAN, costPrice: 3, salePrice: 5.99, unitOfMeasure: 'l', targetQuantity: 60 },
    { sku: 'CLN-002', title: 'Microfiber Cloths Pack', supplierRef: CLEAN, costPrice: 10, salePrice: 19.99, unitOfMeasure: 'box', targetQuantity: 90 },
    { sku: 'CLN-003', title: 'Industrial Mop Set', supplierRef: CLEAN, costPrice: 25, salePrice: 49.99, unitOfMeasure: 'pcs', targetQuantity: 8 },
    { sku: 'CLN-004', title: 'Hand Soap Refill', supplierRef: CLEAN, costPrice: 2.2, salePrice: 4.49, unitOfMeasure: 'l', targetQuantity: 135, image: false },
    { sku: 'CLN-005', title: 'Floor Degreaser', supplierRef: CLEAN, costPrice: 4.8, salePrice: 9.49, unitOfMeasure: 'l', targetQuantity: 42 },
    { sku: 'CLN-006', title: 'Trash Bags 120L Roll', supplierRef: CLEAN, costPrice: 6, salePrice: 11.99, unitOfMeasure: 'pcs', targetQuantity: 0 },
    { sku: 'CLN-007', title: 'Absorbent Granules', supplierRef: RAW, costPrice: 1.1, salePrice: 2.39, unitOfMeasure: 'kg', targetQuantity: 210 },
    { sku: 'CLN-008', title: 'Disinfectant Wipes Tub', supplierRef: null, costPrice: 3.6, salePrice: 6.99, unitOfMeasure: 'pcs', targetQuantity: 54, image: false },
    { sku: 'CLN-009', title: 'Glass Cleaner', supplierRef: CLEAN, costPrice: 2.5, salePrice: 4.99, unitOfMeasure: 'l', targetQuantity: 28 },
    { sku: 'CLN-010', title: 'Scrubbing Sponges 10-Pack', supplierRef: CLEAN, costPrice: 3.2, salePrice: 6.49, unitOfMeasure: 'box', targetQuantity: 66 },
  ]),
  ...inCategory('Safety Equipment', [
    { sku: 'SAF-001', title: 'Safety Glasses Box', supplierRef: SAFETY, costPrice: 20, salePrice: 39.99, unitOfMeasure: 'box', targetQuantity: 50 },
    { sku: 'SAF-002', title: 'Heavy Duty Work Gloves', supplierRef: SAFETY, costPrice: 8, salePrice: 16.99, unitOfMeasure: 'pcs', targetQuantity: 204 },
    { sku: 'SAF-003', title: 'Hard Hat Yellow', supplierRef: SAFETY, costPrice: 12, salePrice: 24.99, unitOfMeasure: 'pcs', targetQuantity: 35 },
    { sku: 'SAF-004', title: 'First Aid Kit Large', supplierRef: SAFETY, costPrice: 40, salePrice: 79.99, unitOfMeasure: 'pcs', targetQuantity: 1 },
    { sku: 'SAF-005', title: 'Hi-Vis Vest', supplierRef: SAFETY, costPrice: 4.5, salePrice: 9.99, unitOfMeasure: 'pcs', targetQuantity: 120, image: false },
    { sku: 'SAF-006', title: 'Ear Plugs 200-Pack', supplierRef: SAFETY, costPrice: 15, salePrice: 28.99, unitOfMeasure: 'box', targetQuantity: 22 },
    { sku: 'SAF-007', title: 'Fire Extinguisher 6kg', supplierRef: SAFETY, costPrice: 38, salePrice: 74.99, unitOfMeasure: 'pcs', targetQuantity: 10 },
    { sku: 'SAF-008', title: 'Barrier Tape', supplierRef: null, costPrice: 0.15, salePrice: 0.35, unitOfMeasure: 'm', targetQuantity: 900, image: false },
    { sku: 'SAF-009', title: 'Dust Masks FFP2', supplierRef: null, costPrice: 18, salePrice: 34.99, unitOfMeasure: 'box', targetQuantity: 9 },
    { sku: 'SAF-010', title: 'Safety Harness', supplierRef: SAFETY, costPrice: 65, salePrice: 129.99, unitOfMeasure: 'pcs', targetQuantity: 0, neverStocked: true },
  ]),
];
