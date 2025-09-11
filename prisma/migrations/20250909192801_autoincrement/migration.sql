/*
  Warnings:

  - The primary key for the `auth_accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `auth_accounts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `auth_sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `auth_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `auth_users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `auth_users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `userId` on the `auth_accounts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `auth_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "zenit"."auth_accounts" DROP CONSTRAINT "auth_accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "zenit"."auth_sessions" DROP CONSTRAINT "auth_sessions_userId_fkey";

-- AlterTable
ALTER TABLE "zenit"."auth_accounts" DROP CONSTRAINT "auth_accounts_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "zenit"."auth_sessions" DROP CONSTRAINT "auth_sessions_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "zenit"."auth_users" DROP CONSTRAINT "auth_users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "zenit"."auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "zenit"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zenit"."auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "zenit"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
