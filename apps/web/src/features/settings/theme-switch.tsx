import { useState } from "react";
import { chooseTheme, readThemeChoice, type ThemeChoice } from "./theme";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Native radio buttons: arrow keys move between them, and screen readers announce the group.
export function ThemeSwitch() {
  const [choice, setChoice] = useState(readThemeChoice);

  const choose = (next: ThemeChoice) => {
    setChoice(next);
    chooseTheme(next);
  };

  return (
    <fieldset>
      <legend className="font-medium text-row">Theme</legend>
      <div className="mt-2">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={choice === option.value}
              onChange={() => choose(option.value)}
              className="size-5 accent-ink"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
