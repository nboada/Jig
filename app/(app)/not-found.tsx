import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-lg font-medium">That page does not exist</p>
      <Link href="/" className="mt-3 inline-block text-sm text-accent hover:underline">
        Back to all snippets
      </Link>
    </div>
  );
}
