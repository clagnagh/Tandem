/**
 * A text field from a submitted form. FormData values can also be Files, so
 * a plain String(value) could quietly turn a file into "[object File]".
 */
export function formText(form: HTMLFormElement | FormData, name: string): string {
  const data = form instanceof FormData ? form : new FormData(form);
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
