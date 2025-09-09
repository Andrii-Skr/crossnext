import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function RoleGuard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as Role | undefined;
  if (!role || !roles.includes(role)) return null;
  return <>{children}</>;
}
