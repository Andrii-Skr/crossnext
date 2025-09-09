"use client";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function UserMenu() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = ["ru", "en", "uk"].includes(segments[0]) ? segments[0] : "ru";
  return (
    <nav className="flex gap-3 items-center">
      <Link href={`/${currentLocale}`} className="underline-offset-4 hover:underline">
        Dictionary
      </Link>
      <button
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => signOut({ callbackUrl: `/${currentLocale}/auth/sign-in` })}
      >
        Logout
      </button>
    </nav>
  );
}
