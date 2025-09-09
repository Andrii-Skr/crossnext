"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: render a stable placeholder until mounted
  if (!mounted) {
    return (
      <Button size="icon" variant="outline" aria-label="Toggle theme" disabled>
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="outline"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">{theme === "dark" ? "Switch to light" : "Switch to dark"}</span>
    </Button>
  );
}
