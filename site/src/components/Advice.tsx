import { Section } from "./ui.tsx";

/** The plan's notes, as a plain ruled list: read once, so they stay quiet beside the plan. */
export default function Advice({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <Section title="Good to know">
      <ul className="flex flex-col">
        {notes.map((n) => (
          <li key={n} className="flex gap-3 border-t border-hairline py-2.5 text-[0.9375rem] leading-relaxed first:border-t-0 first:pt-0">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
