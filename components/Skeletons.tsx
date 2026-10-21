// What the checker and the QR flyer show while their scripts load. Each has the same frame as the
// page it stands in for, the bar with the mark and the language button, the title, the tagline and
// the first steps, so the page doesn't jump when it arrives. The page's language is set on <html>
// before the first paint (lib/pageLang.ts), and CSS shows the words in that language.

import { formatDate } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { BikeIcon } from "./BikeIcon";
import { FlyerSheet } from "./FlyerSheet";
import { Coverage, TitleWords } from "./Hero";

/** One line in both languages. Only the page's own language is shown. */
function Both({ k }: { k: UiKey }) {
  return (
    <>
      <span className="sk-en" lang="en">
        {t("en", k)}
      </span>
      <span className="sk-es" lang="es">
        {t("es", k)}
      </span>
    </>
  );
}

/** The title in both languages, each with its last word in a block. */
function BothTitle() {
  return (
    <>
      <span className="sk-en" lang="en">
        <TitleWords text={t("en", "appName")} />
      </span>
      <span className="sk-es" lang="es">
        <TitleWords text={t("es", "appName")} />
      </span>
    </>
  );
}

/** A date as long as most, standing in for today's. */
const SAMPLE_DATE = "2026-10-21";

const SK_TABS: UiKey[] = ["tabLabel", "tabLink", "tabType"];

function StepTitle({ step, k }: { step: number; k: UiKey }) {
  return (
    <h2 className="card-title">
      <span aria-hidden="true" className="step">
        {step}
      </span>
      <Both k={k} />
    </h2>
  );
}

function LaterStepFrame({ step, k, hint }: { step: number; k: UiKey; hint: UiKey }) {
  return (
    <section className="card card-later space-y-1">
      <StepTitle step={step} k={k} />
      <p className="help pl-10">
        <Both k={hint} />
      </p>
    </section>
  );
}

export function CheckerSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <header className="app-head hero">
        <div className="app-bar">
          <span className="brand-mark" aria-hidden="true">
            <BikeIcon />
          </span>
          {/* The language button's place, so the bar has its full height. The working button comes with the page. */}
          <span className="lang-btn sk-pill" aria-hidden="true">
            <span className="sk-en" lang="es">
              {t("en", "switchLang")}
            </span>
            <span className="sk-es" lang="en">
              {t("es", "switchLang")}
            </span>
          </span>
        </div>
        <h1 className="app-title">
          <BothTitle />
        </h1>
        <p className="tagline">
          <Both k="tagline" />
        </p>
        <Coverage words={(k) => <Both k={k} />} />
      </header>

      <section className="card space-y-5">
        <StepTitle step={1} k="step1" />
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="field-label">
              <Both k="whereLabel" />
            </p>
            <p className="help">
              <Both k="whereHelp" />
            </p>
          </div>
          <div className="combo-field" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18" className="combo-icon">
              <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
            <div className="field combo-input sk-field">
              <Both k="wherePlaceholder" />
            </div>
          </div>
        </div>
        {/* The state, age and date fields, so steps 2 to 4 don't jump down when the page arrives. */}
        <div className="space-y-2" aria-hidden="true">
          <p className="field-label">
            <Both k="state" />
          </p>
          <p className="help">
            <Both k="stateHelp" />
          </p>
          <div className="field sk-field" />
        </div>
        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2" aria-hidden="true">
          <div className="space-y-2">
            <p className="field-label">
              <Both k="age" />
            </p>
            <div className="field sk-field w-32" />
          </div>
          <div className="space-y-2">
            <p className="field-label">
              <Both k="date" />
            </p>
            <div className="flex min-h-12 flex-wrap items-center gap-x-3">
              {/* Today's date isn't known here, so a date of the same length holds its place unseen. */}
              {(["en", "es"] as const).map((lang) => (
                <span key={lang} className={`sk-${lang}`} lang={lang}>
                  {t(lang, "dateToday")}
                  <span className="invisible">, {formatDate(SAMPLE_DATE, lang)}</span>
                </span>
              ))}
              <span className="link-btn">
                <Both k="dateOther" />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="card space-y-5">
        <StepTitle step={2} k="step2" />
        {/* The three tabs with their words, so the track wraps to the same height as the real one. */}
        <div className="tabs sk-tabs" aria-hidden="true">
          {SK_TABS.map((k, i) => (
            <button key={k} type="button" disabled tabIndex={-1} data-on={i === 0 ? "true" : undefined}>
              <Both k={k} />
            </button>
          ))}
        </div>
        {/* The Label photo panel, open first on the real page. */}
        <div className="sk-panel space-y-4" aria-hidden="true">
          <p className="help">
            <Both k="labelHelp" />
          </p>
          <span className="btn w-full">
            <Both k="choosePhoto" />
          </span>
          <p className="meta">
            <Both k="labelPrivacy" />
          </p>
        </div>
      </section>

      <LaterStepFrame step={3} k="step3" hint="stepLater3" />
      <LaterStepFrame step={4} k="results" hint="stepLater4" />
    </div>
  );
}

export function FlyerSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="no-print flex items-center justify-between" aria-hidden="true">
        <span className="link-btn back-link inline-flex items-center gap-2">
          <span>&larr;</span>
          <Both k="flyerBack" />
        </span>
        <span className="btn btn-quiet">
          <Both k="flyerPrint" />
        </span>
      </div>
      <FlyerSheet qr="" url="" />
    </div>
  );
}
