import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Only the stock module writes a product's quantity (#27, docs/adr/0002). A static scan of the server source
// (tests excluded) for anything that looks like a quantity write: an update operator, an update or insert
// call with a quantity field, a `.set('quantity')`, or an assignment to `.quantity`.

const SRC = fileURLToPath(new URL('.', import.meta.url));
const STOCK_MODULE = join('services', 'stock.ts');

const QUANTITY_WRITES: RegExp[] = [
  /\$(inc|set|setOnInsert|unset|min|max|mul)\s*:\s*\{[^}]*\bquantity\b/,
  /\b(update(One|Many)?|findOneAndUpdate|findByIdAndUpdate|replaceOne|findOneAndReplace|bulkWrite|create|insertMany|insertOne)\s*\([^;]*?\bquantity\s*:/s,
  /\.set\(\s*['"`]quantity['"`]/,
  /\.quantity\s*([-+*/]?=(?!=)|\+\+|--)/,
  /\[\s*['"`]quantity['"`]\s*\]\s*([-+*/]?=(?!=)|\+\+|--)/,
];

const writesQuantity = (source: string) => QUANTITY_WRITES.some((pattern) => pattern.test(source));

const sourceFiles = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .filter((file) => !file.split(sep).includes('test'));

describe('architecture: the stock module is the only writer of Product.quantity', () => {
  it('finds no quantity write outside the stock module', () => {
    const offenders = sourceFiles()
      .filter((file) => file !== STOCK_MODULE)
      .filter((file) => writesQuantity(readFileSync(join(SRC, file), 'utf8')))
      .map((file) => relative(SRC, join(SRC, file)));
    expect(offenders).toEqual([]);
  });

  it('scans the real source tree, stock module included', () => {
    const files = sourceFiles();
    expect(files).toContain(STOCK_MODULE);
    expect(files).toContain(join('services', 'products.ts'));
    // The stock module itself writes quantity, so the patterns do match real code
    expect(writesQuantity(readFileSync(join(SRC, STOCK_MODULE), 'utf8'))).toBe(true);
  });

  it.each([
    ['an $inc', `await Product.updateOne({ _id: id }, { $inc: { quantity: 1 } });`],
    ['a $set across lines', `await Product.findByIdAndUpdate(id, {\n  $set: {\n    title,\n    quantity: 0,\n  },\n});`],
    ['a plain update field', `await Product.findByIdAndUpdate(id, { title, quantity: next }, { returnDocument: 'after' });`],
    ['a create with a quantity', `const product = await Product.create({ ...fields, quantity: 5 });`],
    ['a bulk write', `await Product.bulkWrite([{ updateOne: { filter: {}, update: { quantity: 0 } } }]);`],
    ['a document assignment', `product.quantity = ledgerSum;\nawait product.save();`],
    ['a compound assignment', `product.quantity += 1;`],
    ['an increment', `doc.quantity++;`],
    ['a bracket assignment', `doc['quantity'] = 3;`],
    ['a document set', `product.set('quantity', 3);`],
  ])('flags a stray write: %s', (_case, source) => {
    expect(writesQuantity(source)).toBe(true);
  });

  it.each([
    ['a read into a response', `quantity: doc.quantity,`],
    ['a type field', `interface ProductLike {\n  quantity: number;\n}`],
    ['a schema path', `quantity: { type: Number, required: true, min: 0, default: 0 },`],
    ['a comparison', `if (product.quantity === 0) return;`],
    ['a filter on quantity', `Product.find({ quantity: { $lte: 10 } });`],
    ['dropping quantity from a request', `const { quantity, ...fields } = input;\nawait Product.create(fields);`],
  ])('does not flag a read: %s', (_case, source) => {
    expect(writesQuantity(source)).toBe(false);
  });
});
