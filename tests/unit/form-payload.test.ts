import { describe, it, expect } from 'vitest';
import { newField, toFieldPayload, type BuilderField } from '@/lib/cms/form-model';
import { formFieldSchema } from '@/lib/validation/form';

/**
 * What the form builder sends when a form is saved.
 *
 * The mapping used to be an allowlist written inline in the builder, and it
 * stopped at `pattern`. Every property after that — the presentation flags, the
 * column span, the class list and the whole settings object — has a default in
 * `formFieldSchema`, so leaving them out did not fail validation: the defaults
 * were filled in and written over the stored values. Opening a form and
 * pressing Save without touching anything was enough to turn every hidden label
 * back on and discard every per-field setting.
 *
 * These tests put a field through the mapper and the schema together, because
 * that pairing is where the loss happened. A property missing from the payload
 * comes back as its default here, and the round-trip test fails.
 */

/** A field with nothing left at its default, so any dropped property shows. */
function configuredField(): BuilderField {
  return {
    ...newField('TEXT'),
    id: 'field-1',
    label: 'Work email',
    name: 'work_email',
    placeholder: 'you@company.com',
    helpText: 'We only use this to reply.',
    defaultValue: 'hello@example.com',
    isRequired: true,
    width: 'half',
    minLength: '3',
    maxLength: '120',
    pattern: '.+@.+',
    showLabel: false,
    isEnabled: false,
    isHidden: true,
    isReadOnly: true,
    colSpan: '2',
    cssClass: 'my-custom-class',
    settings: { ...newField('TEXT').settings, rows: 7 },
  };
}

describe('toFieldPayload', () => {
  it('carries every presentation and state property through the schema', () => {
    const parsed = formFieldSchema.parse(toFieldPayload(configuredField()));

    // The properties that were being dropped. Each default is the opposite of
    // what is set above, so a missing one fails here rather than silently
    // reverting a form on the next save.
    expect(parsed.showLabel).toBe(false);
    expect(parsed.isEnabled).toBe(false);
    expect(parsed.isHidden).toBe(true);
    expect(parsed.isReadOnly).toBe(true);
    expect(parsed.colSpan).toBe(2);
    expect(parsed.cssClass).toBe('my-custom-class');
    expect(parsed.settings?.rows).toBe(7);
  });

  it('keeps the content and validation properties too', () => {
    const parsed = formFieldSchema.parse(toFieldPayload(configuredField()));

    expect(parsed.id).toBe('field-1');
    expect(parsed.label).toBe('Work email');
    expect(parsed.name).toBe('work_email');
    expect(parsed.placeholder).toBe('you@company.com');
    expect(parsed.helpText).toBe('We only use this to reply.');
    expect(parsed.defaultValue).toBe('hello@example.com');
    expect(parsed.isRequired).toBe(true);
    expect(parsed.width).toBe('half');
    expect(parsed.minLength).toBe(3);
    expect(parsed.maxLength).toBe(120);
    expect(parsed.pattern).toBe('.+@.+');
  });

  it('leaves no property of a builder field unsent', () => {
    // The guard against the next property added to BuilderField going the same
    // way: everything the schema accepts must appear in the payload.
    const payloadKeys = new Set(Object.keys(toFieldPayload(configuredField())));
    const schemaKeys = Object.keys(formFieldSchema.shape);
    const missing = schemaKeys.filter((key) => !payloadKeys.has(key));
    expect(missing, `formFieldSchema accepts these, the payload never sends them: ${missing.join(', ')}`).toEqual([]);
  });

  it('derives a machine name from the label when one was never typed', () => {
    const field = { ...newField('TEXT'), label: 'Company size', name: '' };
    expect(toFieldPayload(field).name).toBe('company_size');
  });

  it('turns the empty numeric strings the builder uses into nulls', () => {
    const field = { ...newField('TEXT'), minLength: '', maxLength: '', colSpan: '' };
    const payload = toFieldPayload(field);
    expect(payload.minLength).toBeNull();
    expect(payload.maxLength).toBeNull();
    // Null colSpan is what makes an older form fall back to its half/full width.
    expect(payload.colSpan).toBeNull();
  });

  it('drops a choice option that has no value', () => {
    const field = {
      ...newField('SELECT'),
      options: [
        { label: 'Real', value: 'real' },
        { label: 'Half-typed', value: '' },
      ],
    };
    expect(toFieldPayload(field).options).toEqual([{ label: 'Real', value: 'real' }]);
  });
});
