import { getTranslations } from "next-intl/server";
import { ScanwordsClient } from "@/components/scanwords/ScanwordsClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("scanwords") };
}

export default async function ScanwordsPage() {
  const editions = await prisma.edition.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      issues: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { issueNumber: { select: { label: true } } },
      },
    },
  });

  const mapped = editions.map((edition) => ({
    id: edition.id,
    code: edition.code,
    name: edition.name,
    hidden: edition.hidden,
    issues: edition.issues.map((issue) => ({
      id: String(issue.id),
      label: issue.issueNumber.label,
      filterTemplateId: issue.filterTemplateId,
      hidden: issue.hidden,
    })),
  }));

  return <ScanwordsClient editions={mapped} />;
}
