export default function Section({ id, eyebrow, title, lede, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`} className="m-0 mt-1.5 text-3xl font-extrabold sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-[66ch] text-base text-muted sm:text-lg">{lede}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
