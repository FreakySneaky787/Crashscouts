import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { IconComponent } from "./icons";
import styles from "./Form.module.css";

type FieldMeta = { id: string; label: string; hint?: string; error?: string };

function describedBy(id: string, hint?: string, error?: string) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

function FieldFrame({ id, label, hint, error, children }: FieldMeta & { children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Single-line text input with label, optional hint and error message. */
export function TextField({ id, label, hint, error, className, ...input }: FieldMeta & ComponentPropsWithoutRef<"input">) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={`${styles.control} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldFrame>
  );
}

/** Multi-line text input. */
export function TextAreaField({ id, label, hint, error, ...textarea }: FieldMeta & ComponentPropsWithoutRef<"textarea">) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...textarea}
      />
    </FieldFrame>
  );
}

/** Native select (accessible, works without JavaScript). */
export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  ...select
}: FieldMeta & { options: { value: string; label: string }[] } & ComponentPropsWithoutRef<"select">) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/** Radio group shown as selectable cards, e.g. the feedback type. */
export function ChoiceGroup({
  name,
  legend,
  options,
  defaultValue,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; icon?: IconComponent }[];
  defaultValue?: string;
}) {
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.choiceRow}>
        {options.map(({ value, label, icon: Icon }) => (
          <label key={value} className={styles.choice}>
            <input type="radio" name={name} value={value} defaultChecked={value === defaultValue} />
            {Icon ? <Icon aria-hidden="true" className={styles.choiceIcon} /> : null}
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Single checkbox with a label, e.g. a confirmation. The error is linked via aria-describedby. */
export function CheckboxField({
  id,
  label,
  error,
  ...input
}: { id: string; label: ReactNode; error?: string } & Omit<ComponentPropsWithoutRef<"input">, "type">) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.checkbox}>
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...input}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Group of checkboxes for a multiple choice from a fixed list (e.g. platforms). */
export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  selected,
  error,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
  error?: string;
}) {
  const describedBy = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className={styles.choices} aria-describedby={describedBy}>
      <legend className={styles.label}>{legend}</legend>
      {hint ? (
        <p id={`${name}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <div className={styles.choiceRow}>
        {options.map(({ value, label }) => (
          <label key={value} className={styles.choice}>
            <input type="checkbox" name={name} value={value} defaultChecked={selected.includes(value)} />
            {label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Inline note below form fields, e.g. privacy or attachment rules. */
export function FormNote({ icon: Icon, children }: { icon?: IconComponent; children: ReactNode }) {
  return (
    <p className={styles.note}>
      {Icon ? <Icon aria-hidden="true" className={styles.noteIcon} /> : null}
      <span>{children}</span>
    </p>
  );
}
