"use client";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeSwitcher() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: render a stable placeholder until mounted
  if (!mounted) {
    return (
      <Button size="icon" variant="outline" aria-label={t("toggleTheme")} disabled>
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="outline"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={t("toggleTheme")}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">{theme === "dark" ? t("switchToLight") : t("switchToDark")}</span>
    </Button>
  );
}
