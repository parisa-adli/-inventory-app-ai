import { STOCK_MOVEMENT_TYPES } from '../constants';

/**
 * Seed stock movements - historical stock changes
 *
 * Note: productRef and userRef are identifier strings that will be resolved during seeding
 * - productRef: product SKU to look up
 * - userRef: user email to look up
 * - createdAt: dates are relative to seeding time for realistic historical data
 */
export const seedStockMovements = [
  // Electronics - Wireless Mouse initial stock
  {
    productRef: 'ELEC-WM-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 200,
    resultingQuantity: 200,
    note: 'Initial stock receipt',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-09-01T09:00:00Z'),
  },
  {
    productRef: 'ELEC-WM-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 50,
    resultingQuantity: 150,
    note: 'Bulk order to corporate client',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-15T14:30:00Z'),
  },

  // USB-C Cables
  {
    productRef: 'ELEC-USBC-002',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 500,
    resultingQuantity: 500,
    note: 'Bulk order arrival',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-20T10:00:00Z'),
  },
  {
    productRef: 'ELEC-USBC-002',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 150,
    resultingQuantity: 350,
    note: 'Retail distribution',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-10T11:15:00Z'),
  },
  {
    productRef: 'ELEC-USBC-002',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 50,
    resultingQuantity: 300,
    note: 'Office supply order',
    userRef: 'emily.staff@inventory.local',
    createdAt: new Date('2026-09-20T15:45:00Z'),
  },

  // Laptop Stand - low stock example
  {
    productRef: 'ELEC-LS-003',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 100,
    resultingQuantity: 100,
    note: 'New product line',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-15T09:30:00Z'),
  },
  {
    productRef: 'ELEC-LS-003',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 55,
    resultingQuantity: 45,
    note: 'Multiple small orders',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-18T13:20:00Z'),
  },

  // Webcam - very low stock
  {
    productRef: 'ELEC-WC-004',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 50,
    resultingQuantity: 50,
    note: 'Initial inventory',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-10T08:00:00Z'),
  },
  {
    productRef: 'ELEC-WC-004',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 30,
    resultingQuantity: 20,
    note: 'Remote work equipment package',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-05T10:30:00Z'),
  },
  {
    productRef: 'ELEC-WC-004',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 10,
    resultingQuantity: 10,
    note: 'Conference room setup',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-22T14:00:00Z'),
  },
  {
    productRef: 'ELEC-WC-004',
    type: STOCK_MOVEMENT_TYPES.ADJUST,
    quantity: -2,
    resultingQuantity: 8,
    note: 'Damaged units - water damage in storage',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-09-24T16:30:00Z'),
  },

  // Mechanical Keyboard - out of stock scenario
  {
    productRef: 'ELEC-KB-005',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 75,
    resultingQuantity: 75,
    note: 'Premium product line launch',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-01T09:00:00Z'),
  },
  {
    productRef: 'ELEC-KB-005',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 75,
    resultingQuantity: 0,
    note: 'Sold out - high demand product',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-20T11:00:00Z'),
  },

  // A4 Paper - high volume item
  {
    productRef: 'OFF-A4-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 1000,
    resultingQuantity: 1000,
    note: 'Monthly bulk order',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-09-01T07:00:00Z'),
  },
  {
    productRef: 'OFF-A4-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 300,
    resultingQuantity: 700,
    note: 'Office distribution',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-10T09:00:00Z'),
  },
  {
    productRef: 'OFF-A4-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 200,
    resultingQuantity: 500,
    note: 'School supply order',
    userRef: 'emily.staff@inventory.local',
    createdAt: new Date('2026-09-20T10:30:00Z'),
  },

  // Office Desk
  {
    productRef: 'FURN-DESK-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 20,
    resultingQuantity: 20,
    note: 'Quarterly furniture shipment',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-25T08:00:00Z'),
  },
  {
    productRef: 'FURN-DESK-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 8,
    resultingQuantity: 12,
    note: 'New office setup',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-12T13:00:00Z'),
  },

  // Cordless Drill Kit
  {
    productRef: 'TOOL-DR-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 50,
    resultingQuantity: 50,
    note: 'Tool inventory restock',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-30T09:00:00Z'),
  },
  {
    productRef: 'TOOL-DR-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 20,
    resultingQuantity: 30,
    note: 'Construction contractor order',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-15T11:30:00Z'),
  },
  {
    productRef: 'TOOL-DR-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 5,
    resultingQuantity: 25,
    note: 'Maintenance team requisition',
    userRef: 'emily.staff@inventory.local',
    createdAt: new Date('2026-09-23T14:15:00Z'),
  },

  // Cardboard Boxes - high turnover
  {
    productRef: 'PACK-BOX-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 2000,
    resultingQuantity: 2000,
    note: 'Monthly packaging supply',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-09-01T08:00:00Z'),
  },
  {
    productRef: 'PACK-BOX-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 500,
    resultingQuantity: 1500,
    note: 'Shipping department',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-08T10:00:00Z'),
  },
  {
    productRef: 'PACK-BOX-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 500,
    resultingQuantity: 1000,
    note: 'Warehouse operations',
    userRef: 'emily.staff@inventory.local',
    createdAt: new Date('2026-09-18T09:30:00Z'),
  },

  // Safety Glasses - inventory adjustment example
  {
    productRef: 'SAFE-SG-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 60,
    resultingQuantity: 60,
    note: 'Safety equipment restock',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-28T09:00:00Z'),
  },
  {
    productRef: 'SAFE-SG-001',
    type: STOCK_MOVEMENT_TYPES.ADJUST,
    quantity: -10,
    resultingQuantity: 50,
    note: 'Physical count correction - found broken units',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-21T15:00:00Z'),
  },

  // First Aid Kit - low stock alert item
  {
    productRef: 'SAFE-FAK-004',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 10,
    resultingQuantity: 10,
    note: 'Safety compliance order',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-20T10:00:00Z'),
  },
  {
    productRef: 'SAFE-FAK-004',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 7,
    resultingQuantity: 3,
    note: 'Facility safety stations',
    userRef: 'sarah.manager@inventory.local',
    createdAt: new Date('2026-09-16T13:45:00Z'),
  },

  // Steel Rods
  {
    productRef: 'RAW-SR-001',
    type: STOCK_MOVEMENT_TYPES.RECEIVE,
    quantity: 200,
    resultingQuantity: 200,
    note: 'Raw materials delivery',
    userRef: 'admin@inventory.local',
    createdAt: new Date('2026-08-22T07:30:00Z'),
  },
  {
    productRef: 'RAW-SR-001',
    type: STOCK_MOVEMENT_TYPES.SHIP,
    quantity: 100,
    resultingQuantity: 100,
    note: 'Production floor requisition',
    userRef: 'john.staff@inventory.local',
    createdAt: new Date('2026-09-14T09:00:00Z'),
  },
];
