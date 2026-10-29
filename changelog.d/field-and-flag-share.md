section: Docs

- **Which ranked tools are barely in the contest, and what a malware flag
  means.** The README summary and the benchmark pages now name the ranked
  tools that score below 0.10 (on npm, 3 of the 5 others; on PyPI, 4 of 7),
  and say what share of Penthera's malware flags would be right if 1 package
  in 1,000 were malicious: about 2.7% on npm at the top of the false-alarm
  interval, 1.6% on PyPI at the measured rate (0.9% at the top). Exploratory,
  computed from `published.json`; the registered ranking is unchanged.
