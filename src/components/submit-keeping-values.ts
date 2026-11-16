import { startTransition, type FormEvent } from "react";

/**
 * An `onSubmit` that runs a `useActionState` action without React's form reset. A form submitted
 * through `action` is reset once the action settles, errors included, so its fields would drop what
 * was typed and chosen behind the error notice. A form that should clear on success resets itself.
 */
export function submitKeepingValues(action: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };
}
