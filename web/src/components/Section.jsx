export default function Section({ id, eyebrow, title, lede, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 id={`${id}-title`} className="m-0 mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-[68ch] text-lg text-muted">{lede}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
