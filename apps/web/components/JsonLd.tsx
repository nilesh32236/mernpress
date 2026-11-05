/**
 * Renders a JSON-LD block. `<` is escaped so stored content can never close the
 * script element early (the same trick Next.js uses in its own examples).
 */
export default function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
