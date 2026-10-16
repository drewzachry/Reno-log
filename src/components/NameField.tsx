import { ui } from "./ui";

/** "Your name" input; the value is saved by saveNameFrom on the server. */
export function NameField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <div>
      <label className={ui.label} htmlFor="yourName">
        Your name
      </label>
      <input
        id="yourName"
        name="yourName"
        className={ui.input}
        autoComplete="name"
        maxLength={80}
        defaultValue={defaultValue ?? ""}
        required
      />
      <p className="text-muted mt-1 text-xs">Shown to the people you share the project with.</p>
    </div>
  );
}
