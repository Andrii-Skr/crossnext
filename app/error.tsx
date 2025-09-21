"use client";
export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <pre className="text-sm text-muted-foreground whitespace-pre-wrap">
        {error.message}
      </pre>
    </div>
  );
}
