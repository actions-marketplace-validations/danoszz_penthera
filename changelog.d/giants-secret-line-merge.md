section: Fixed

- **`--giants`: a private key two tools report is one finding.** Penthera
  reads a secret's value back from the reported line to merge it with other
  tools' findings, and a line inside a private key block has no value on its
  own, so gitleaks' and Penthera's report of the same key stayed apart. When
  either finding has no value, they now merge on file and line; two different
  values on one line still do not. Found in E14's dev half and logged as a
  deviation in its pre-registration.
