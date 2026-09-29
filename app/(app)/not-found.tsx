import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-[17px] font-medium">That page does not exist</p>
      <Link href="/" className="mt-3 inline-block text-body text-accent hover:underline">
        Back to home
      </Link>
    </div>
  );
}
