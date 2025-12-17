"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Tab = "expired" | "trash" | "users" | "tags";

type Props = {
  activeTab: Tab;
  langCode: string;
  tagFilter?: string;
  labels: Record<Tab, string>;
  canAccessTags: boolean;
  canManageUsers: boolean;
};

export function AdminTabsNav({ activeTab, langCode, tagFilter, labels, canAccessTags, canManageUsers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [isPending, startTransition] = useTransition();

  const buildHref = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("lang", langCode);
      params.set("tab", tab);
      if (tab === "tags" && tagFilter) {
        params.set("tag", tagFilter);
      } else {
        params.delete("tag");
      }
      return `${pathname}?${params.toString()}`;
    },
    [langCode, pathname, searchParams, tagFilter],
  );

  const navigate = useCallback(
    (tab: Tab) => {
      const href = buildHref(tab);
      setPendingTab(tab);
      // Prefetch to reduce perceived delay on heavy server responses
      router.prefetch(href);
      startTransition(() => {
        router.replace(href);
      });
    },
    [buildHref, router],
  );

  const renderButton = (tab: Tab) => {
    if (tab === "tags" && !canAccessTags) return null;
    if (tab === "users" && !canManageUsers) return null;
    const isActive = activeTab === tab;
    const showSpinner = isPending && pendingTab === tab;
    const isDisabled = isPending && pendingTab !== tab;

    return (
      <Button
        key={tab}
        variant={isActive ? "default" : "outline"}
        className="flex-1 min-w-[140px] md:min-w-0"
        type="button"
        onClick={() => navigate(tab)}
        disabled={isDisabled}
      >
        {showSpinner ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {labels[tab]}
      </Button>
    );
  };

  return (
    <nav className="flex flex-wrap md:flex-col gap-2">
      {renderButton("expired")}
      {renderButton("trash")}
      {renderButton("tags")}
      {renderButton("users")}
    </nav>
  );
}
