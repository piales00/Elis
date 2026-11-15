import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { GROUPS } from "../../content/sensors.js";
import Icon from "./icons.jsx";

export const LAYERS = ["cells", "truecolor", "thermal", "night", "swir"];

function LayerOptions({ layer, onLayer, heat, onHeat, disabled }) {
  const { t } = useI18n();
  return (
    <>
      <div role="radiogroup" aria-label={t("layers.label")} className="fc-seg">
        {LAYERS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={layer === l} disabled={disabled} onClick={() => onLayer(l)} className="fc-seg-item">
            {t(`layers.${l}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={heat && layer !== "cells"}
        disabled={disabled}
        onClick={onHeat}
        title={t("layers.heat.title")}
        className="fc-toggle"
      >
        <span aria-hidden="true" className="fc-heat-swatch" />
        {t("layers.heat")}
      </button>
    </>
  );
}

function SensorOptions({ group, onGroup }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t("map.metric.label")} className="fc-seg">
      {GROUPS.map((g) => (
        <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => onGroup(g)} className="fc-seg-item">
          {t(`layers.sensor.${g}`)}
        </button>
      ))}
    </div>
  );
}

export default function LayerSwitcher(props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !wrap.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={wrap} className="pointer-events-auto relative">
      <div className="hidden flex-col items-end gap-2 xl:flex">
        <div className="fc-float flex items-center gap-1.5 rounded-xl p-1.5">
          <LayerOptions {...props} />
        </div>
        {props.layer === "cells" && (
          <div className="fc-float flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5">
            <span className="text-xs font-semibold text-muted">{t("layers.sensor")}</span>
            <SensorOptions {...props} />
          </div>
        )}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="fc-float fc-press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold xl:hidden"
      >
        <Icon name="layers" size={18} />
        {t(`layers.${props.layer}`)}
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="fc-float fc-pop absolute right-0 top-full z-30 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-2 rounded-xl p-2 xl:hidden [&_.fc-seg]:flex-wrap">
          <LayerOptions {...props} />
          {props.layer === "cells" && (
            <>
              <p className="m-0 mt-1 text-xs font-semibold text-muted">{t("layers.sensor")}</p>
              <SensorOptions {...props} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
