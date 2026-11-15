import { useI18n } from "../../i18n/I18nProvider.jsx";
import { DATA_SOURCES, SOFTWARE } from "../../content/sources.js";
import Icon from "./icons.jsx";

export default function Attributions({ id = "sources" }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-5">
      <div className="grid gap-1">
        <h3 id={`${id}-title`} className="fc-section-title">
          {t("src.title")}
        </h3>
        <p className="m-0 max-w-[70ch] text-sm leading-relaxed text-muted">{t("src.lede")}</p>
      </div>
      <ul className="fc-sources">
        {DATA_SOURCES.map((s) => (
          <li key={s.key}>
            <a href={s.url} target="_blank" rel="noopener" className="fc-source-name">
              {t(`src.${s.key}.name`)}
              <Icon name="external" size={12} />
            </a>
            <p className="m-0 text-[13px] leading-relaxed">{t(`src.${s.key}.use`)}</p>
            <p className="m-0 text-xs leading-relaxed text-muted">{t(`src.${s.key}.licence`)}</p>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 @3xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <h4 className="fc-h !m-0">{t("src.software")}</h4>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {SOFTWARE.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener" className="fc-chip-link">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
          <p className="m-0 text-xs leading-relaxed text-muted">{t("src.cite")}</p>
        </div>
        <div className="grid content-start gap-2 rounded-xl border border-line p-4">
          <h4 className="m-0 text-sm font-semibold">{t("src.ai.title")}</h4>
          <p className="m-0 text-[13px] leading-relaxed text-muted">{t("src.ai.text")}</p>
        </div>
      </div>
    </section>
  );
}
