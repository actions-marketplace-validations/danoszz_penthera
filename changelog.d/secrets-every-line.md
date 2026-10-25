section: Changed

- **A secret finding lists every line it hit.** The scan still reports one
  finding per rule and file, so baselines and suppressions keep their ids, but
  the finding now carries `lines`, its description names the other lines, the
  terminal shows `+N more`, and SARIF lists them as related locations. A file
  with ten keys now shows ten places to fix.
