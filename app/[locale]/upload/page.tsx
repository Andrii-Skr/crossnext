"use client";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadPanel } from "@/components/upload/UploadPanel";

export default function UploadPage() {
  const t = useTranslations();

  return (
    <div className="mx-auto w-[min(900px,calc(100vw-2rem))] py-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("upload")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadPanel />
        </CardContent>
      </Card>
    </div>
  );
}
