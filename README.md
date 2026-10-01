# kliniki
Clinic and Pharmacy Platform

Kliniki runs the front desk and dispensary of a small Kenyan clinic: the day's queue, patient records,
pharmacy stock, billing (M-Pesa, cash or SHA) and SHA claims. It is one React Native codebase, built with
[Expo](https://expo.dev), that runs on Android, iOS and the web.

| Section | What it does |
| --- | --- |
| Today | Takings, stock alerts and pending claims at a glance; the live queue with walk-ins, *Call in* and *Finish & bill* |
| Patients | Register and edit patients (Kenyan phone validation, consent), search by name, phone or SHA number, see visits and bills |
| Appointments | Book visits; each day's queue numbers start at 1 |
| Pharmacy | Batches with expiry dates, reorder and expiry warnings, receiving stock |
| Billing | Services and drugs on one bill; dispensed drugs come off stock first-expiry-first-out |
| SHA claims | Bills paid through SHA draft a claim automatically: Draft → Submitted → Approved or Rejected |
| Reports | Revenue for the last 7 days and by payment method, most dispensed drugs, bills copied as CSV |

## Running it

You need Node 20.19.4+, 22.13+ or 24.3+ (React Native 0.86's requirement).

```sh
npm install
npm start          # then press w for the web, or scan the QR code with Expo Go on a phone
npm run web        # straight to the browser
npm run android    # Android emulator or a connected device
npm run ios        # iOS simulator (macOS only); on Windows use Expo Go on an iPhone
```

Wide screens (over 820px) get a sidebar; phones and narrow windows get a bottom tab bar. The app follows
the system light or dark setting.

## Checks

```sh
npm test           # unit tests for the business rules and the data store
npm run typecheck
npm run lint
npx expo-doctor    # dependency and config health
```

## Where things are

```
src/
  app/          routes (Expo Router): one file per screen, (tabs)/ holds the sections inside the app shell
  domain/       business rules as plain TypeScript with tests: billing, stock, claims, dates in EAT, validation
  store/        Zustand store, saved on the device with AsyncStorage (localStorage on the web)
  components/   UI kit (ui/), dialogs (modals/), app shell (layout/), toasts (feedback/)
  theme/        colours, Figtree font weights
```

Screens never change data directly: every change goes through a store action, which calls a pure function
in `src/domain` and keeps the result only if it succeeded. Forms show the errors those functions return.

## Data

Everything is stored on the device the app runs on; there is no server yet. A fresh install starts with
demo data, and *Reports → Reset demo data* puts it back.

## Differences from the prototype

The design and behaviour follow the original HTML prototype. These are the deliberate changes:

- **Expired stock is never dispensed.** The prototype's first-expiry-first-out deduction would take expired
  batches first. Expired batches still count as stock on the shelf, but cannot be billed and are tagged *Expired*.
- **Dates are East Africa Time throughout.** The prototype mixed EAT and UTC, so between midnight and 3am the
  7-day report and the 60-day expiry window were a day out.
- **Tables become cards on narrow screens** instead of scrolling sideways.
- **Stricter forms**: a date of birth cannot be in the future, quantities and prices are whole numbers, and
  phone numbers are saved without spaces.
- **CSV export defuses spreadsheet formulas** (a patient named `=HYPERLINK(...)` is exported as text).
- **Contrast**: two text colours are slightly darker, and dark mode uses dark text on green buttons, to meet
  WCAG AA.

## Shipping

- **Web:** `npm run export:web` writes a static single-page app to `dist/`. Configure the host to serve
  `index.html` for unknown paths so links such as `/patients/abc` work on reload.
- **Android and iOS:** build with [EAS](https://docs.expo.dev/build/introduction/)
  (`npx eas-cli@latest build`). Set `ios.bundleIdentifier` and `android.package` in `app.json` first.
