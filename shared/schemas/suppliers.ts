import { z } from 'zod';
import { catalogListQuerySchema, formField, optionalText, requiredText } from './catalog';

export const SUPPLIER_NAME_MAX = 100;
export const SUPPLIER_CONTACT_MAX = 100;
export const SUPPLIER_PHONE_MAX = 30;
export const SUPPLIER_ADDRESS_MAX = 300;
export const SUPPLIER_NOTES_MAX = 1000;

const name = requiredText('Name', SUPPLIER_NAME_MAX);
const contactPerson = optionalText('Contact person', SUPPLIER_CONTACT_MAX);
const phone = optionalText('Phone', SUPPLIER_PHONE_MAX).regex(
  /^[+\d][\d\s()\-.]*$/,
  'Enter a phone number (digits, spaces, + - . and brackets)'
);
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));
const address = optionalText('Address', SUPPLIER_ADDRESS_MAX);
const notes = optionalText('Notes', SUPPLIER_NOTES_MAX);

/** Body of POST /api/suppliers. Empty optional fields are left out. */
export const createSupplierSchema = z.object({
  name,
  contactPerson: contactPerson.optional(),
  phone: phone.optional(),
  email: email.optional(),
  address: address.optional(),
  notes: notes.optional(),
});

/** Body of PATCH /api/suppliers/:id: absent = unchanged, `null` = clear. The name cannot be cleared. */
export const updateSupplierSchema = z
  .object({
    name: name.optional(),
    contactPerson: contactPerson.nullable().optional(),
    phone: phone.nullable().optional(),
    email: email.nullable().optional(),
    address: address.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Send at least one field to change',
  });

/** The create/edit dialog. Empty inputs are allowed; the client maps them before sending. */
export const supplierFormSchema = z.object({
  name,
  contactPerson: formField(contactPerson),
  phone: formField(phone),
  email: formField(email),
  address: formField(address),
  notes: formField(notes),
});

export const listSuppliersQuerySchema = catalogListQuerySchema;

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierFormValues = z.infer<typeof supplierFormSchema>;
