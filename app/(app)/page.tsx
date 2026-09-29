import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageIcon } from "@/components/LanguageIcon";
import { CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";
import { SearchInput } from "@/components/SearchInput";
import { listCredentials } from "@/lib/credentials";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { countLibrary } from "@/lib/library";
import { listNotes } from "@/lib/notes";
import { listSnippets } from "@/lib/snippets";

type Search = { q?: string; lang?: string; tag?: string };

/** One line in a card, a result group or the recent feed. */
type Item = { key: string; href: string; title: string; meta: string; icon: React.ReactNode; updatedAt: string };

// Search results show this many per kind, then link to the full list.
const PER_KIND = 5;
// The overview's cards show this many each; the recent feed shows RECENT across all kinds.
const PER_CARD = 3;
const RECENT = 8;

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  // The snippet list used to live here; keep its old filter links working.
  if (search.lang || search.tag) redirect(`/snippets?${new URLSearchParams(search as Record<string, string>)}`);

  const db = await getDb();
  const q = search.q?.trim() ?? "";
  // Without a search, fetch enough of each kind to fill the recent feed from any mix.
  const limit = q ? PER_KIND + 1 : RECENT;
  const [snippets, notes, credentials] = await Promise.all([
    listSnippets(db, { query: q, limit }),
    listNotes(db, { query: q, limit }),
    listCredentials(db, { query: q, limit }),
  ]);

  const kinds = [
    {
      name: "Snippets",
      href: "/snippets",
      create: "/snippets/new",
      Icon: SnippetsIcon,
      items: snippets.map<Item>((s) => ({
        key: `s:${s.slug}`,
        href: `/snippets/${s.slug}`,
        title: s.title,
        meta: languageLabel(s.language),
        icon: <LanguageIcon language={s.language} className="size-3.5" />,
        updatedAt: s.updatedAt,
      })),
    },
    {
      name: "Notes",
      href: "/notes",
      create: "/notes/new",
      Icon: NotesIcon,
      items: notes.map<Item>((n) => ({
        key: `n:${n.slug}`,
        href: `/notes/${n.slug}`,
        title: n.title,
        meta: "Note",
        icon: <NotesIcon className="size-3.5 text-muted" />,
        updatedAt: n.updatedAt,
      })),
    },
    {
      name: "Credentials",
      href: "/credentials",
      create: "/credentials/new",
      Icon: CredentialsIcon,
      // Titles only: secret values never leave the credential's own page.
      items: credentials.map<Item>((c) => ({
        key: `c:${c.slug}`,
        href: `/credentials/${c.slug}`,
        title: c.title,
        meta: "Credential",
        icon: <CredentialsIcon className="size-3.5 text-muted" />,
        updatedAt: c.updatedAt,
      })),
    },
  ];

  return (
    <div className="space-y-8">
      <form action="/">
        <SearchInput placeholder="Search snippets, notes and credentials" />
      </form>

      {q ? (
        <Results q={q} kinds={kinds} />
      ) : (
        <Overview kinds={kinds} counts={await countLibrary(db)} />
      )}
    </div>
  );
}

type Kind = {
  name: string;
  href: string;
  create: string;
  Icon: typeof SnippetsIcon;
  items: Item[];
};

function Overview({ kinds, counts }: { kinds: Kind[]; counts: Record<string, number> }) {
  const recent = kinds
    .flatMap((k) => k.items)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {kinds.map((k) => {
          const count = counts[k.name.toLowerCase()] ?? 0;
          return (
            <section key={k.name} className="flex flex-col rounded-lg border border-line bg-panel">
              <div className="flex items-center gap-3 p-4">
                <Link href={k.href} className="group flex flex-1 items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-md bg-raised text-accent">
                    <k.Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block font-medium group-hover:underline">{k.name}</span>
                    <span className="block text-xs text-muted">{count === 1 ? "1 item" : `${count} items`}</span>
                  </span>
                </Link>
                <Link
                  href={k.create}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-muted hover:text-text"
                >
                  New
                </Link>
              </div>
              {k.items.length > 0 ? (
                <ul className="border-t border-line py-1">
                  {k.items.slice(0, PER_CARD).map((item) => (
                    <li key={item.key}>
                      <ItemLink item={item} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-line px-4 py-5 text-sm text-muted">Nothing here yet.</p>
              )}
            </section>
          );
        })}
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm text-muted">Recently edited</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {recent.map((item) => (
              <li key={item.key}>
                <ItemLink item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Results({ q, kinds }: { q: string; kinds: Kind[] }) {
  const found = kinds.filter((k) => k.items.length > 0);
  if (found.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
        <p className="text-muted">{`Nothing matches “${q}”.`}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-accent hover:underline">
          Clear search
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {found.map((k) => (
        <section key={k.name}>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted">
            <k.Icon className="size-4" />
            <h2>{k.name}</h2>
            {k.items.length > PER_KIND && (
              <Link href={`${k.href}?q=${encodeURIComponent(q)}`} className="ml-auto text-accent hover:underline">
                See all
              </Link>
            )}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {k.items.slice(0, PER_KIND).map((item) => (
              <li key={item.key}>
                <ItemLink item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemLink({ item, compact = false }: { item: Item; compact?: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 transition hover:bg-raised ${compact ? "px-4 py-2" : "px-4 py-3"}`}
    >
      {item.icon}
      <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
      {!compact && <span className="hidden text-xs text-muted sm:inline">{item.meta}</span>}
      <span className="shrink-0 text-xs text-muted">{timeAgo(item.updatedAt)}</span>
    </Link>
  );
}
