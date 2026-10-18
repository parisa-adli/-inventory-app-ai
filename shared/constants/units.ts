/** A product's unit of measure (PRD §4). Quantities are whole numbers in every unit. */
export const UNITS_OF_MEASURE = ['pcs', 'kg', 'box', 'l', 'm'] as const;

export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number];
