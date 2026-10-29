section: Docs

- **An exploratory re-analysis of the public benchmarks, after the
  registered one.** [bench/public/RESULTS.md](../bench/public/RESULTS.md)
  adds intervals that resample CredData by repository, recall over every
  true row and every malicious package next to the registered in-scope
  recall, and a log of what each tuning pass on the dev half changed. No
  registered number, rank or verdict changes. `node bench/public/reanalysis.mjs`
  rebuilds it from the local per-item files, with no download.
- **A results-file checklist.** [docs/research/results-checklist.md](../docs/research/results-checklist.md)
  lists 19 reporting items from STARD 2015 and the ACM SIGSOFT Empirical
  Standards, each with where it lives in our files. A test checks that every
  results file links it or has an abstract, data and code, limits and
  changes.
- **Scope-free secrets recall on the site and blog.** The secrets benchmark
  page and the CredData post now say that, counted over every true
  credential row, Penthera's recall is 0.25 and it would place 5th by F1.
  The registered ranking counts in-scope rows and is unchanged.
- **E11b disclosures.** The npm malware table shows the rate over all
  `malicious_intent` packages next to the registered payload row. E11b's
  deviations log a fix that landed 15 minutes before the split was sealed
  (`litellm`) and the pass-limit question for library mode.
- **Fixed:** an unclosed entry in `docs/references.bib` had hidden one
  reference and shown another under the wrong anchor.
