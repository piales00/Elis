import { Component } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function Fallback({ message }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-sm">
        <p className="m-0 font-semibold text-white">{t("map.failed.title")}</p>
        <p className="m-0 mt-1 text-sm text-[#9aa6b7]">{t("map.failed.text")}</p>
        <p className="m-0 mt-2 text-xs text-[#9aa6b7]">{message}</p>
      </div>
    </div>
  );
}

export default class MapBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <Fallback message={this.state.error.message} />;
    return this.props.children;
  }
}
