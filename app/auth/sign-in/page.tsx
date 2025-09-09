import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = {
  title: "Sign in",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-sm w-full py-16">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <SignInForm />
    </div>
  );
}

