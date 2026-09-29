# Exostan

Clinical decision support for impacted mandibular third molars. A dentist uploads a panoramic radiograph (OPG), AI places the 12 landmarks, the dentist verifies them, and Exostan returns an extraction difficulty percentage and an inferior alveolar nerve (IAN) contact likelihood, plus branded reports for the dentist and the patient.

Built from the paper *Artificial Intelligence-Based Assessment of Surgical Difficulty in Impacted Mandibular Third Molars: A Proposed Clinical Decision-Support Framework*.

**Research use only.** Not a medical device. The treating dentist is responsible for every clinical decision. CBCT remains the reference standard for nerve relation.

## What it does

| Step | Who | What happens |
| --- | --- | --- |
| 1. Upload | Dentist | Drops in an OPG (JPG or PNG) |
| 2. Detect | Exostan | Finds the impacted third molar on either side, places 12 landmarks, reads the Rood and Shehab signs |
| 3. Approve | Dentist | Drags any point that is off, then approves |
| 4. Review | Dentist | Confirms signs, adds observations and actions taken, makes the final call |
| 5. Report | Exostan | Dentist PDF, patient PDF, patient email, referral letter, JSON record for the patient file |

## Scoring

| Output | Method |
| --- | --- |
| Extraction difficulty % | Pederson index (Winter angulation, Pell and Gregory depth and ramus relation) plus modifiers for M2 contact, IAN proximity and root morphology |
| IAN contact likelihood % | Apex to canal distance, updated by the published likelihood ratios of the Rood and Shehab signs |
| Paper rule | The flowchart's binary Easy or Difficult verdict, with the reasons listed |

All measurements are geometric, computed from the verified landmarks. Nothing in the score is guessed by the model.

### Rood and Shehab weights

| Sign | LR+ | Source |
| --- | --- | --- |
| Diversion of the canal | 5.49 | Atieh 2010 pooled meta-analysis |
| Darkening of the root | 4.26 | Atieh 2010 pooled meta-analysis |
| Narrowing of the root | 2.60 | Derived from sensitivity and specificity vs CBCT |
| Interruption of the white line | 2.05 | Atieh 2010 pooled meta-analysis |
| Narrowing of the canal | 2.01 | Derived from sensitivity and specificity vs CBCT |
| Deflection of the root | 1.82 | Derived from sensitivity and specificity vs CBCT |
| Dark and bifid apex | 1.00 | Not predictive in most studies, so no weight |

The in-app Knowledge base tab carries the full reference with sources.

## How it learns

Saved cases are de-identified: no patient name or file number reaches the database. After surgery the dentist records the actual difficulty, surgery time, CBCT result and nerve outcome.

| Stage | Threshold |
| --- | --- |
| Similar-case estimate blends into the difficulty score | 5 cases with recorded outcomes |
| IAN weights refit on the clinic's own data | 20 CBCT-verified cases |
| Accuracy tracking | From the first case |

Until those thresholds are met, the published rules and literature weights decide alone.

## Layout

| Path | What it holds |
| --- | --- |
| `web/` | The app: one HTML page, its stylesheet, its script and the jsPDF library |
| `supabase/functions/exostan/` | Edge function: AI proxy, case library API, and a copy of the page served from the database |
| `supabase/migrations/` | Database schema |
| `tools/` | Build script for the static folder, and the single-file artifact version |

## Deploy

### 1. Database

```bash
supabase db push
```

Or paste `supabase/migrations/0001_exostan.sql` into the SQL editor.

### 2. Edge function

```bash
supabase functions deploy exostan --no-verify-jwt
```

### 3. Secrets

Set these on the Supabase project, under Edge Functions, Secrets:

| Secret | Required | What it is |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | An API key from console.anthropic.com. Billed per call, separate from any Claude subscription |
| `EXOSTAN_ACCESS_CODE` | Recommended | A shared password. Visitors enter it once per browser, so the key is not open to the public |
| `EXOSTAN_MODEL_DEFAULT` | No | Model for the region pass |
| `EXOSTAN_MODEL_COMPLEX` | No | Model for the landmark and correction passes |

Check it worked: `GET /functions/v1/exostan/health` should report `"ai": true`.

### 4. Web page

`web/` is static. Host it anywhere. Point it at the backend by editing the `BASE` constant at the top of `web/exostan.js`.

The page needs a Content Security Policy that allows the backend:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://YOUR-PROJECT.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

## Cost

Roughly $0.10 to $0.30 per radiograph for the three detection passes, billed to the Anthropic API account.

## Privacy

| Data | Where it goes |
| --- | --- |
| Radiograph | Sent to the Anthropic API for detection. Not stored by Exostan |
| Patient name and file number | Stay in the browser. They appear on the PDFs only |
| Case findings | Stored de-identified in the database |

UAE health data law treats patient imaging as regulated data. Keep storage in-region and anonymised, and register the tool if it is ever marketed as diagnostic rather than decision support.

## Status

Prototype. AI landmark placement is approximate by design, which is why the dentist verifies before anything is scored. No public panoramic dataset carries extraction difficulty labels, so the accuracy of the difficulty score improves only from recorded outcomes. For nerve contact, the closest public dataset is CONTACT (1,478 root and canal pairs from 1,010 patients).
